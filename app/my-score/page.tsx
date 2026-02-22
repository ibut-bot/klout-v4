"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useAuth } from "../hooks/useAuth";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useSearchParams, useRouter } from "next/navigation";
import { getKloutCpmMultiplier } from "@/lib/klout-cpm";

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || "";
const KLOUT_SCORE_FEE_LAMPORTS = Number(
  process.env.NEXT_PUBLIC_KLOUT_SCORE_FEE_LAMPORTS || 10_000_000,
);
const PAGE_SIZE = 50;

// --- Types ---

interface ScoreBreakdown {
  reach: { score: number; followers: number };
  engagement: {
    score: number;
    avgLikes: number;
    avgRetweets: number;
    avgReplies: number;
    avgViews: number;
    tweetsAnalyzed: number;
  };
  ratio: { score: number; followers: number; following: number };
  verification: { score: number; type: string | null };
  geo: {
    multiplier: number;
    tier: number | null;
    tierLabel: string;
    location: string | null;
  };
}

interface ScoreResult {
  id: string;
  totalScore: number;
  label: string;
  breakdown: ScoreBreakdown;
  qualityScore: number;
  buffedImageUrl?: string | null;
  tierQuote?: string | null;
  xUsername?: string;
  profileImageUrl?: string;
  createdAt?: string;
}

type Step =
  | "idle"
  | "checking_x"
  | "paying"
  | "confirming"
  | "calculating"
  | "generating_image"
  | "done"
  | "error";

interface KloutUser {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  twitterId: string | null;
  score: number;
  rank: number;
}

interface LeaderboardPagination {
  page: number;
  pageSize: number;
  nextPage: number | null;
  hasMore: boolean;
  total: number;
}

// --- Helpers ---

const formatNumber = (num: number): string => {
  if (num < 100000) return new Intl.NumberFormat("en").format(num);
  return new Intl.NumberFormat("en", {
    notation: "compact",
    compactDisplay: "short",
  }).format(num);
};

function AnimatedScore({ target }: { target: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [target]);

  return <>{formatNumber(value)}</>;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const isExternal = src.startsWith("http");
  const url = isExternal
    ? `/api/proxy-image?url=${encodeURIComponent(src)}`
    : src;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image load failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(e);
    };
    img.src = objectUrl;
  });
}

async function generateShareCard(score: ScoreResult): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

  if (score.buffedImageUrl) {
    try {
      const img = await loadImage(score.buffedImageUrl);
      const scale = Math.max(W / img.width, H / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
    } catch {
      // keep dark background
    }
  }

  const grad = ctx.createLinearGradient(0, H * 0.6, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.4)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 110px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  const scoreText = formatNumber(score.totalScore);
  ctx.fillText(scoreText, 50, H - 130);
  const scoreTextWidth = ctx.measureText(scoreText).width;

  const kloutLogo = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "/Klout.png";
  });
  const kloutH = 140;
  const kloutW = (kloutLogo.width / kloutLogo.height) * kloutH;
  ctx.drawImage(kloutLogo, 50 + scoreTextWidth + 10, H - 260, kloutW, kloutH);

  ctx.fillStyle = "#eab308";
  ctx.font = "bold 36px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(score.label, 54, H - 85);

  if (score.tierQuote) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "italic 24px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    const quote = `"${score.tierQuote}"`;
    const maxW = W - 120;
    const words = quote.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const display = lines.slice(0, 2);
    display.forEach((l, i) => {
      ctx.fillText(l, 54, H - 45 + i * 30);
    });
  }

  try {
    const enhLogo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "/enhanced.png";
    });
    const enhH = 40;
    const enhW = (enhLogo.width / enhLogo.height) * enhH;
    ctx.drawImage(enhLogo, W - enhW - 50, H - enhH - 130, enhW, enhH);
  } catch {
    // silent
  }

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
}

// --- Leaderboard Components ---

function FallbackAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-sm font-semibold text-muted">
      {initials || "??"}
    </div>
  );
}

function ScoreRow({ user }: { user: KloutUser }) {
  const [imgError, setImgError] = useState(false);
  const displayName = user.name || user.username || "Anonymous";

  return (
    <div className="flex items-center gap-3 border-b border-k-border px-4 py-3 last:border-b-0 transition-colors hover:bg-surface-hover">
      <span className="w-10 shrink-0 text-center text-sm font-semibold text-zinc-500">
        {user.rank}
      </span>
      {user.image && !imgError ? (
        <img
          src={user.image.replace("normal", "400x400")}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <FallbackAvatar name={displayName} />
      )}
      <div className="min-w-0 flex-1">
        {user.username ? (
          <a
            href={`https://x.com/${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-medium text-white hover:text-accent transition-colors"
          >
            {displayName}
          </a>
        ) : (
          <span className="block truncate font-medium text-white">
            {displayName}
          </span>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5 text-lg font-semibold text-accent">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        {formatNumber(user.score)}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b border-k-border px-4 py-3 last:border-b-0">
      <div className="h-4 w-10 shrink-0 animate-pulse rounded bg-surface-hover" />
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
      <div className="flex-1">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="h-5 w-16 shrink-0 animate-pulse rounded bg-surface-hover" />
    </div>
  );
}

// --- Tab: My Klout Score ---

function MyScoreTab() {
  const { isAuthenticated, authFetch } = useAuth();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const searchParams = useSearchParams();

  const [xLinked, setXLinked] = useState<boolean | null>(null);
  const [xUsername, setXUsername] = useState<string | null>(null);
  const [linkingX, setLinkingX] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [hasFollowed, setHasFollowed] = useState(false);

  useEffect(() => {
    setHasFollowed(localStorage.getItem('klout_has_followed') === 'true');
  }, []);

  useEffect(() => {
    const xLink = searchParams.get('x_link');
    const xUser = searchParams.get('x_username');
    if (xLink === 'success' && xUser) {
      setXLinked(true);
      setXUsername(xUser);
    }
  }, [searchParams]);

  const handleShare = useCallback(async () => {
    if (!scoreResult) return;
    setSharing(true);
    try {
      const blob = await generateShareCard(scoreResult);
      if (!blob) return;

      const referralPath = xUsername ? `/${xUsername.toLowerCase()}` : "";
      const shareUrl = `${window.location.origin}${referralPath}`;
      const tweetText = `My @kloutgg score just got #ENHANCED. Get yours at ${shareUrl}`;

      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "klout-score.png";
        a.click();
        URL.revokeObjectURL(url);
      }

      const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      window.open(twitterUrl, "_blank");
    } catch (err) {
      console.error("Share failed:", err);
    } finally {
      setSharing(false);
    }
  }, [scoreResult]);

  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch("/api/auth/x/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setXLinked(data.linked);
          setXUsername(data.xUsername);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, authFetch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadingExisting(true);
    authFetch("/api/klout-score")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.score) {
          setScoreResult(data.score);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [isAuthenticated, authFetch]);

  const handleLinkX = useCallback(async () => {
    setLinkingX(true);
    try {
      const res = await authFetch("/api/auth/x/authorize?returnTo=/my-score");
      const data = await res.json();
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {}
    setLinkingX(false);
  }, [authFetch]);

  const handleCalculateScore = useCallback(async () => {
    if (!publicKey) return;
    setError(null);
    setStep("paying");

    try {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: KLOUT_SCORE_FEE_LAMPORTS,
        }),
      );

      const sig = await sendTransaction(tx, connection);
      setStep("confirming");

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      setStep("calculating");

      const res = await authFetch("/api/klout-score/calculate", {
        method: "POST",
        body: JSON.stringify({ feeTxSig: sig }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || "Score calculation failed");
      }

      setScoreResult(data.score);
      setStep("done");
    } catch (err: any) {
      const msg = err?.message || "Something went wrong";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setStep("idle");
        return;
      }
      setError(msg);
      setStep("error");
    }
  }, [publicKey, connection, sendTransaction, authFetch]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <p className="text-zinc-500">Connect your wallet to view your score.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* X Link Status */}
      {xLinked === false && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <p className="text-sm text-amber-400 mb-3">
            You need to link your X account before calculating your score.
          </p>
          <button
            onClick={handleLinkX}
            disabled={linkingX}
            className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
          >
            {linkingX ? "Redirecting..." : "Link X Account"}
          </button>
        </div>
      )}

      {/* Follow @kloutgg Prompt — only when X is linked, no score yet, and hasn't followed */}
      {xLinked && !scoreResult && !hasFollowed && (
        <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-5 space-y-3 text-center">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 mt-0.5 text-accent flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white">
                Follow @kloutgg on X
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Make sure to follow{" "}
                <span className="text-accent font-medium">@kloutgg</span> on
                X/Twitter to stay updated on new campaigns and platform news.
              </p>
            </div>
          </div>
          <a
            href="https://x.com/intent/follow?screen_name=kloutgg"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              localStorage.setItem('klout_has_followed', 'true');
              setHasFollowed(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-black hover:bg-accent-hover transition-colors"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Follow @kloutgg
          </a>
        </div>
      )}

      {/* Existing Score Display */}
      {scoreResult && (
        <div className="mb-6 rounded-2xl border border-k-border bg-surface overflow-hidden">
          <div className="relative w-full bg-zinc-900">
            {scoreResult.buffedImageUrl ? (
              <img
                src={scoreResult.buffedImageUrl}
                alt="Buffed profile"
                className="w-full object-contain"
              />
            ) : (
              <div className="w-full aspect-square bg-zinc-800" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 flex items-end justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <img src="/Klout.png" alt="Klout" className="h-10" />
                  <p className="text-4xl font-black text-white leading-none">
                    <AnimatedScore target={scoreResult.totalScore} />
                  </p>
                </div>
                <p className="mt-1 text-sm font-semibold text-accent">
                  {scoreResult.label}
                </p>
              </div>
              <img
                src="/enhanced.svg"
                alt="Enhanced"
                className="h-5 opacity-70 mb-0.5"
              />
            </div>
          </div>

          <div className="p-5">
            {scoreResult.tierQuote && (
              <p className="mb-4 text-center text-sm italic text-zinc-400">
                &ldquo;{scoreResult.tierQuote}&rdquo;
              </p>
            )}

            <div className="mb-5 rounded-xl border border-k-border bg-zinc-800/50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-zinc-500">Your CPM Multiplier</p>
                <p className="text-lg font-bold text-white">{(getKloutCpmMultiplier(scoreResult.totalScore) * 100).toFixed(0)}%</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-zinc-500">of base campaign CPM</p>
                {getKloutCpmMultiplier(scoreResult.totalScore) < 1 && (
                  <p className="text-[11px] text-accent">Increase your score to earn more</p>
                )}
              </div>
            </div>

            <button
              onClick={handleShare}
              disabled={sharing}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50 animate-pulse-gentle"
            >
              {sharing ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              )}
              {sharing
                ? "Generating..."
                : "Share on X (image copied to clipboard)"}
            </button>
          </div>
        </div>
      )}

      {/* Calculate / Recalculate Button — disabled until user has followed @kloutgg */}
      {xLinked && (hasFollowed || scoreResult) && (
        <div className="rounded-2xl border border-k-border bg-surface p-6 text-center">
          {step === "idle" || step === "done" || step === "error" ? (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <p className="text-sm text-zinc-400 mb-4">
                {scoreResult
                  ? "Want to recalculate? Your score may have changed."
                  : "Calculate your Klout score based on your X profile and recent posts."}
              </p>

              <button
                onClick={handleCalculateScore}
                disabled={!publicKey}
                className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scoreResult ? "Recalculate Score" : "Get My Score"} — 0.01 SOL
              </button>
              <p className="mt-2 text-xs text-zinc-600">
                Fee covers X API costs. Score is computed from your profile
                metrics and historical tweets performance.
              </p>
            </>
          ) : (
            <div className="py-4">
              <div className="mb-4 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
              <p className="text-sm font-medium text-white">
                {step === "paying" &&
                  "Approve the transaction in your wallet..."}
                {step === "confirming" && "Confirming payment on Solana..."}
                {step === "calculating" &&
                  "Analyzing your X profile & tweets..."}
                {step === "generating_image" &&
                  "Generating your buffed profile image..."}
                {step === "checking_x" && "Checking X account..."}
              </p>
              {step === "calculating" && (
                <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
                  Evaluating reach · engagement rate · follower ratio · verification status · location
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                This may take a few seconds
              </p>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loadingExisting && !scoreResult && (
        <div className="rounded-2xl border border-k-border bg-surface p-8">
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Tab: Klout Scores ---

function ScoresTab() {
  const { isAuthenticated, authFetch } = useAuth()
  const [users, setUsers] = useState<KloutUser[]>([])
  const [currentUser, setCurrentUser] = useState<KloutUser | null>(null)
  const [pagination, setPagination] = useState<LeaderboardPagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (page: number, append: boolean) => {
    try {
      const fetcher = isAuthenticated ? authFetch : fetch
      const res = await fetcher(`/api/klout-scores?page=${page}&pageSize=${PAGE_SIZE}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load')
      setUsers((prev) => (append ? [...prev, ...data.users] : data.users))
      setPagination(data.pagination)
      if (page === 1 && data.currentUser) {
        setCurrentUser(data.currentUser)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }, [isAuthenticated, authFetch])

  useEffect(() => {
    setLoading(true)
    fetchPage(1, false).finally(() => setLoading(false))
  }, [fetchPage])

  const handleLoadMore = async () => {
    if (!pagination?.hasMore || loadingMore) return
    setLoadingMore(true)
    await fetchPage(pagination.nextPage!, true)
    setLoadingMore(false)
  }

  return (
    <>
      <div className="mb-6 text-center">
        <p className="text-sm text-zinc-500">
          {pagination ? `${formatNumber(pagination.total)} users ranked` : 'Loading...'}
        </p>
      </div>

      {/* Current user's rank pinned at top */}
      {currentUser && !loading && (
        <div className="mb-3 overflow-hidden rounded-2xl border border-accent/30 bg-accent/5">
          <div className="px-4 py-1.5 border-b border-accent/20">
            <span className="text-xs font-semibold text-accent">Your Rank</span>
          </div>
          <ScoreRow user={currentUser} />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-k-border bg-surface">
        {loading ? (
          Array.from({ length: 10 }, (_, i) => <SkeletonRow key={i} />)
        ) : error ? (
          <div className="p-8 text-center text-red-400">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No scores yet.</div>
        ) : (
          users.map((user) => <ScoreRow key={user.id} user={user} />)
        )}
      </div>

      {pagination?.hasMore && !loading && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-6 w-full rounded-xl bg-surface py-3 text-sm font-semibold text-accent border border-k-border transition-colors hover:bg-surface-hover hover:border-k-border-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </>
  )
}

// --- Main Page ---

export default function MyScorePage() {
  return (
    <Suspense>
      <MyScorePageContent />
    </Suspense>
  );
}

function MyScorePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab =
    searchParams.get("tab") === "scores" ? "scores" : "my-score";

  return (
    <div className="mx-auto max-w-2xl pb-20">
      {/* Tab Bar */}
      <div className="mb-8 flex items-center justify-center">
        <div className="inline-flex rounded-xl bg-surface border border-k-border p-1">
          <button
            onClick={() => router.replace("/my-score", { scroll: false })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "my-score"
                ? "bg-accent text-black"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            My Klout Score
          </button>
          <button
            onClick={() =>
              router.replace("/my-score?tab=scores", { scroll: false })
            }
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "scores"
                ? "bg-accent text-black"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Klout Scores
          </button>
        </div>
      </div>

      {activeTab === "my-score" ? <MyScoreTab /> : <ScoresTab />}
    </div>
  );
}
