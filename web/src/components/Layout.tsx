/**
 * App shell. Mobile-first: a bottom tab bar on phones (thumb reach, and it
 * clears the iOS home indicator), a top nav from `md` up.
 */

import { NavLink, Outlet } from 'react-router-dom';

import { cx } from './ui';

const TABS = [
  { to: '/', label: 'Record', end: true },
  { to: '/journal', label: 'Journal', end: false },
  { to: '/library', label: 'Library', end: false },
  { to: '/sequences', label: 'Sequences', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

function tabClass({ isActive }: { isActive: boolean }): string {
  return cx(
    // Five tabs on a 390px screen: shrink the padding and let the label size
    // step up on wider phones rather than wrapping.
    'flex-1 rounded-xl px-1.5 py-2 text-center text-xs font-semibold transition-colors sm:px-3 sm:text-sm',
    isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg'
  );
}

export function Layout() {
  return (
    <div className="min-h-dvh">
      {/* Desktop nav */}
      <header className="sticky top-0 z-10 hidden bg-bg/90 backdrop-blur md:block">
        <nav className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          <span className="mr-4 text-lg font-extrabold">BJJ Notes</span>
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28 md:px-6 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex gap-1 bg-bg/95 px-3 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Back link + title used by the detail screens. */
export function DetailHeader({
  backTo,
  backLabel,
  children,
}: {
  backTo: string;
  backLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <NavLink to={backTo} className="text-sm font-semibold text-accent">
        ← {backLabel}
      </NavLink>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
