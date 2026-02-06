'use client'

import TaskForm from '../../components/TaskForm'
import { useAuth } from '../../hooks/useAuth'

export default function NewTaskPage() {
  const { isAuthenticated, connected } = useAuth()

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Post a Task</h1>
      <p className="mb-8 text-sm text-zinc-500">
        Describe what you need done and set a budget. A small fee is charged to post.
      </p>

      {!connected ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-zinc-500">Connect your wallet to post a task.</p>
        </div>
      ) : !isAuthenticated ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-zinc-500">Sign in with your wallet to post a task.</p>
        </div>
      ) : (
        <TaskForm />
      )}
    </div>
  )
}
