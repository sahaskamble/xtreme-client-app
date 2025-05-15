import React from 'react';
import ReactDOM from 'react-dom/client';
import { app, events, init, window as neuWindow } from '@neutralinojs/lib';
import App from './App';
import './index.css';
import { ThemeProvider } from './components/theme/theme-provider';

(async function() {
	if (import.meta.env.DEV && !window.NL_TOKEN) {
		try {
			// method 1
			const storedToken = sessionStorage.getItem('NL_TOKEN');
			if (storedToken) {
				window.NL_TOKEN = storedToken;
			} else {
				// method 2
				const authInfo = await import('../.tmp/auth_info.json');
				const { nlToken, nlPort } = authInfo;
				window.NL_PORT = nlPort;
				window.NL_TOKEN = nlToken;
				window.NL_ARGS = [
					'bin\\neutralino-win_x64.exe',
					'',
					'--load-dir-res',
					'--path=.',
					'--export-auth-info',
					'--neu-dev-extension',
					'--neu-dev-auto-reload',
					'--window-enable-inspector',
				];
			}
		} catch {
			console.error('Auth file not found, native API calls will not work.');
		}
	}

	// Initialize Neutralino
	try {
		await init();
		console.log('Neutralino initialized successfully');
	} catch (error) {
		console.error('Error initializing Neutralino:', error);
	}

	// Render the React app
	ReactDOM.createRoot(document.getElementById('root')).render(
		<React.StrictMode>
			<ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
				<App />
			</ThemeProvider>
		</React.StrictMode>
	);

	// Handle window close event
	events.on('windowClose', () => {
		console.log('Window close event received, exiting app');
		app.exit();
	});

	// Focus the main window
	try {
		await neuWindow.focus();
	} catch (error) {
		console.error('Error focusing window:', error);
	}
})();
