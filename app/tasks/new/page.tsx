'use client'

import TaskForm from '../../components/TaskForm'
import { useAuth } from '../../hooks/useAuth'

export default function NewTaskPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-white">Post a Campaign</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Describe your campaign and set a budget.
      </p>

      {!isAuthenticated ? (
        <div className="rounded-xl border border-dashed border-k-border p-12 text-center">
          <p className="text-zinc-400">Connect your wallet to post a campaign.</p>
        </div>
      ) : (
        <TaskForm />
      )}
    </div>
  )
}
