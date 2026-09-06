import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-brand-navy text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

export function AppShell() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-slate-900">Pickem Sports</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/leagues" className={navLinkClass}>
              Leagues
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
            <button
              type="button"
              onClick={() => signOut()}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
