import { allIcons } from 'even-toolkit/web';
import React from 'react';
import { Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { HomeView } from './webview/HomeView';
import { SettingsView } from './webview/SettingsView';

type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;

const IcHome = allIcons['menu-home'] as SvgIcon;
const IcHomeActive = allIcons['menu-home-highlighted'] as SvgIcon;
const IcGear = allIcons['menu-gear'] as SvgIcon;
const IcGearActive = allIcons['menu-gear-highlighted'] as SvgIcon;

const PAGE_TITLES: Record<string, string> = {
	'/': 'Home',
	'/settings': 'Settings',
};

const PAGE_SUBTITLES: Record<string, string> = {
	'/': 'Bird recognition companion',
	'/settings': 'Preferences, location, and diagnostics',
};

interface TabDef {
	path: string;
	Icon: SvgIcon;
	IconActive: SvgIcon;
}

const TABS: TabDef[] = [
	{ path: '/', Icon: IcHome, IconActive: IcHomeActive },
	{ path: '/settings', Icon: IcGear, IconActive: IcGearActive },
];

function BottomNav() {
	const location = useLocation();
	const navigate = useNavigate();
	const active = location.pathname;

	return (
		<nav className="birdie-bottom-nav">
			{TABS.map((tab) => {
				const isActive = active === tab.path;
				const TabIcon = isActive ? tab.IconActive : tab.Icon;
				return (
					<button
						key={tab.path}
						type="button"
						onClick={() => navigate(tab.path, { replace: true })}
						className={[
							'flex-1 flex flex-col items-center justify-center py-2 cursor-pointer transition-colors',
							isActive ? 'text-accent' : 'text-text-dim hover:text-text',
						].join(' ')}
						aria-current={isActive ? 'page' : undefined}
					>
						<TabIcon width={35} height={35} />
					</button>
				);
			})}
		</nav>
	);
}

function Layout() {
	const location = useLocation();
	const title = PAGE_TITLES[location.pathname] ?? 'Home';
	const subtitle = PAGE_SUBTITLES[location.pathname] ?? 'Bird recognition companion';
	return (
		<div className="birdie-app-shell">
			<div className="birdie-app-shell__ornament birdie-app-shell__ornament--top" aria-hidden />
			<div className="birdie-app-shell__ornament birdie-app-shell__ornament--bottom" aria-hidden />

			<div className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden">
				<div className="shrink-0 px-3 pt-3">
					<div className="birdie-shell-panel">
						<div className="birdie-header">
							<div className="min-w-0">
								<p className="birdie-header__eyebrow">Birdie</p>
								<div className="birdie-header__row">
									<h1 className="birdie-header__title">{title}</h1>
									<span className="birdie-header__dot" aria-hidden />
								</div>
								<p className="birdie-header__subtitle">{subtitle}</p>
							</div>
						</div>
					</div>
				</div>
				<main className="min-h-0 flex-1 overflow-hidden px-3 pt-3">
					<Outlet />
				</main>
				<div className="shrink-0 px-3 pb-3 pt-2">
					<BottomNav />
				</div>
			</div>
		</div>
	);
}

export default function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route index element={<HomeView />} />
				<Route path="settings" element={<SettingsView />} />
			</Route>
		</Routes>
	);
}
