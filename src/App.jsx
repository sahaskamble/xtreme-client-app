import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from './components/ui/button';
import { ModeToggle } from './components/theme/toggle-theme';
import { Label } from './components/ui/label';
import { computer, window as neuWindow, app, events } from '@neutralinojs/lib';
import Login from './components/Login';
import SessionManager from './components/SessionManager';
import SnacksInfo from './components/SnacksInfo';
import DeviceRegistration from './components/DeviceRegistration';
import SessionStateManager from './components/SessionStateManager';
import DeviceTokenMonitor from './components/DeviceTokenMonitor';
import ScreenshotMonitor from './components/ScreenshotMonitor';
import { useCollection } from './hooks/useCollection';
import { getSavedLoginInfo } from './utils/helper_functions';
import pbclient from '@/lib/pocketbase/pb';

function App() {
	const [whichOs, setWhichOs] = useState('');
	const [isKioskMode, setIsKioskMode] = useState(false);
	const [currentTime, setCurrentTime] = useState('');
	const [currentDate, setCurrentDate] = useState('');
	const [deviceId, setDeviceId] = useState(null);
	const [showDeviceRegistration, setShowDeviceRegistration] = useState(false);
	const [hasActiveSession, setHasActiveSession] = useState(false);
	const [activeSessionData, setActiveSessionData] = useState(null);

	const { isAuthenticated, getAuthUser, logout } = useCollection('users');
	const { getList: getDevicesList } = useCollection('devices');
	const savedInfo = getSavedLoginInfo(); // Getting saved info from LocalStorage

	// Check if device info is stored in localStorage
	const savedDeviceInfo = localStorage.getItem('device_info');
	const parsedDeviceInfo = savedDeviceInfo ? JSON.parse(savedDeviceInfo) : null;

	// Initialize state with saved values or defaults
	const [isLoggedIn, setIsLoggedIn] = useState(savedInfo?.isLoggedIn || isAuthenticated());
	const [username, setUsername] = useState(savedInfo?.username || getAuthUser()?.username || '');
	const [userId, setUserId] = useState(savedInfo?.userId || getAuthUser()?.id || null);

	const keyboardHandler = useRef(null);
	const autoLoginAttempted = useRef(false);

	async function getOs() {
		try {
			const info = await computer.getOSInfo();
			console.log('OS Info:', info);
			setWhichOs(info.name + ' ' + info.version);
		} catch (error) {
			console.error('Error getting OS info:', error);
			setWhichOs('Error getting OS info');
		}
	}

	function updateTime() {
		const now = new Date();

		const hours = now.getHours().toString().padStart(2, '0');
		const minutes = now.getMinutes().toString().padStart(2, '0');
		const seconds = now.getSeconds().toString().padStart(2, '0');
		setCurrentTime(`${hours}:${minutes}:${seconds}`);

		const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
		setCurrentDate(now.toLocaleDateString(undefined, options));
	}

	async function enableKioskMode() {
		try {
			await neuWindow.setSize({
				width: window.screen.width,
				height: window.screen.height,
				resizable: false,
				borderless: true,
				alwaysOnTop: true,
				maximize: true
			});

			await neuWindow.setFullScreen();
			const fullScreenStatus = await neuWindow.isFullScreen();
			setIsKioskMode(fullScreenStatus);
			console.log('Kiosk mode enabled:', fullScreenStatus);

			if (!keyboardHandler.current) {
				keyboardHandler.current = (e) => {
					// Prevent Ctrl, Alt, Win, Tab keys
					if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') {
						e.preventDefault();
						e.stopPropagation();
						console.log('Blocked key:', e.key);
						return false;
					}
				};

				document.addEventListener('keydown', keyboardHandler.current, true);
				console.log('Keyboard shortcuts disabled');
			}
		} catch (error) {
			console.error('Error enabling kiosk mode:', JSON.stringify(error));
			setIsKioskMode(false);
		}
	}

	async function disableKioskMode() {
		try {
			const isFullScreen = await neuWindow.isFullScreen();
			if (isFullScreen) {
				await neuWindow.exitFullScreen();
			}

			// Set fixed window size of 600x800 and disable resizing
			await neuWindow.setSize({
				width: 600,
				height: 800,
				resizable: false, // Prevent resizing
				borderless: false, // Enable window bar
				alwaysOnTop: false,
				maximize: false
			});

			// Set fixed size to prevent resizing
			// Note: Neutralino.js doesn't have setMinSize/setMaxSize methods
			// We're using resizable: false instead

			await neuWindow.center();

			// Store window size in localStorage to restore on reload
			localStorage.setItem('window_size', JSON.stringify({
				width: 600,
				height: 800,
				isLoggedIn: true
			}));

			// Enabling all keyboard shortcuts
			if (keyboardHandler.current) {
				document.removeEventListener('keydown', keyboardHandler.current, true);
				keyboardHandler.current = null;
				console.log('Keyboard shortcuts enabled');
			}

			setIsKioskMode(false);
			console.log('Kiosk mode disabled, window resized to 600x800');
		} catch (error) {
			console.error('Error disabling kiosk mode:', JSON.stringify(error));
		}
	}

	const handleLogin = async (user) => {
		console.log('User logged in:', user);

		// Set user information
		setIsLoggedIn(true);
		setUsername(user.username);
		setUserId(user.id);

		// Use the stored device ID if available
		const loginDeviceId = deviceId || user.deviceId || null;

		// Store login info in localStorage to persist across reloads
		localStorage.setItem('user_login_info', JSON.stringify({
			isLoggedIn: true,
			username: user.username,
			userId: user.id,
			deviceId: loginDeviceId
		}));

		// Check if this is a client app login
		const isClientAppLogin = localStorage.getItem('client_app_login') === 'true';
		console.log('Is client app login:', isClientAppLogin);

		// Check if there's an active session for this device
		if (loginDeviceId) {
			try {
				const sessions = await pbclient.collection('sessions').getList(1, 1, {
					filter: `device = "${loginDeviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
					sort: '-created'
				});

				if (sessions && sessions.items.length > 0) {
					// If there's an active session, disable kiosk mode
					await disableKioskMode();
					console.log("Kiosk mode disabled after login due to active session");

					// Update session state
					setHasActiveSession(true);
					setActiveSessionData(sessions.items[0]);
				} else {
					// If there's no active session
					if (isClientAppLogin) {
						// For client app login, disable kiosk mode and let SessionManager create a new session
						await disableKioskMode();
						console.log("Kiosk mode disabled for client app login - new session will be created");
					} else {
						// For regular login with no active session, keep kiosk mode enabled
						await enableKioskMode();
						console.log("Kiosk mode enabled after login due to no active session");
					}
				}
			} catch (sessionError) {
				console.error("Error checking for active sessions after login:", sessionError);

				// For client app login, always disable kiosk mode
				if (isClientAppLogin) {
					await disableKioskMode();
					console.log("Kiosk mode disabled for client app login (after error)");
				} else {
					// Default to disabling kiosk mode on error during regular login
					await disableKioskMode();
					console.log("Kiosk mode disabled after login (default on error)");
				}
			}
		} else {
			// If no device ID, disable kiosk mode by default
			await disableKioskMode();
			console.log("Kiosk mode disabled after login (no device ID)");
		}

		console.log('Login complete with device ID:', loginDeviceId);
		console.log('Session will be started automatically');
	};

	// Handle device registration
	const handleDeviceRegistered = async (newDeviceId) => {
		console.log("Device registered:", newDeviceId);
		setDeviceId(newDeviceId);
		setShowDeviceRegistration(false);

		// Enable kiosk mode after device registration (default state)
		try {
			await enableKioskMode();
			console.log("Kiosk mode enabled after device registration (default state)");
		} catch (error) {
			console.error("Error enabling kiosk mode after device registration:", error);
		}
	};

	// Handle session state changes
	const handleSessionStateChange = async (isActive, sessionData) => {
		console.log("Session state changed:", isActive, sessionData);
		setHasActiveSession(isActive);
		setActiveSessionData(sessionData);

		// If there's an active session, disable kiosk mode
		if (isActive && isLoggedIn) {
			try {
				await disableKioskMode();
				console.log("Kiosk mode disabled due to active session");
			} catch (error) {
				console.error("Error disabling kiosk mode:", error);
			}
		} else if (!isActive) {
			// If there's no active session, enable kiosk mode (regardless of login state)
			try {
				await enableKioskMode();
				console.log("Kiosk mode enabled due to no active session");
			} catch (error) {
				console.error("Error enabling kiosk mode:", error);
			}
		}
	};

	// Handle auto-login from device token
	const handleAutoLogin = async (userData) => {
		console.log("Auto-login from device token:", userData);

		try {
			// Set user information
			setIsLoggedIn(true);
			setUsername(userData.username);
			setUserId(userData.userId);

			// Store login info in localStorage
			localStorage.setItem('user_login_info', JSON.stringify({
				isLoggedIn: true,
				username: userData.username,
				userId: userData.userId,
				deviceId: userData.deviceId
			}));

			console.log("Auto-login successful from device token");

			// Check if there's an active session for this device
			if (userData.deviceId) {
				try {
					const sessions = await pbclient.collection('sessions').getList(1, 1, {
						filter: `device = "${userData.deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
						sort: '-created'
					});

					if (sessions && sessions.items.length > 0) {
						// If there's an active session, disable kiosk mode
						await disableKioskMode();
						console.log("Kiosk mode disabled after auto-login due to active session");

						// Update session state
						setHasActiveSession(true);
						setActiveSessionData(sessions.items[0]);
					} else {
						// If there's no active session, keep kiosk mode enabled
						await enableKioskMode();
						console.log("Kiosk mode enabled after auto-login due to no active session");
					}
				} catch (sessionError) {
					console.error("Error checking for active sessions after auto-login:", sessionError);
					// Default to disabling kiosk mode on error during auto-login
					await disableKioskMode();
					console.log("Kiosk mode disabled after auto-login (default on error)");
				}
			} else {
				// If no device ID, disable kiosk mode by default
				await disableKioskMode();
				console.log("Kiosk mode disabled after auto-login (no device ID)");
			}

			// Session check is already done above

			// Don't force a window reload as it causes issues
			console.log("Auto-login complete, no need to reload the page");
		} catch (error) {
			console.error("Error during auto-login:", error);
		}
	};

	// Function to check for device token and auto-login
	const checkDeviceTokenAndLogin = useCallback(async () => {
		// Skip if we've already attempted auto-login
		if (autoLoginAttempted.current) {
			console.log("Auto-login already attempted, skipping");
			return false;
		}

		// Mark that we've attempted auto-login
		autoLoginAttempted.current = true;

		try {
			console.log("Checking for device token to auto-login");

			// Get device information - this would typically be based on some device identifier
			// For now, we'll just get the first available device with a token
			const devices = await getDevicesList(1, 1, '-created', 'status = "Occupied" && token != ""');

			if (devices && devices.length > 0) {
				const device = devices[0];
				console.log("Found device with token:", device.id);

				if (device.token) {
					console.log("Attempting auto-login with device token");

					try {
						// Set the auth store with the token
						pbclient.authStore.save(device.token, JSON.parse(device?.record));

						// Check if the token is valid
						if (pbclient.authStore.isValid) {
							try {
								// Get the user ID from the auth store
								// Note: We're using authStore.token to get the user ID directly
								// to avoid using the deprecated model property
								const tokenData = JSON.parse(atob(pbclient.authStore.token.split('.')[1]));
								const userId = tokenData.id || tokenData.sub;

								if (!userId) {
									console.error("No user ID found in token");
									return false;
								}

								// Get the user data
								const authUser = await pbclient.collection('clients').getOne(userId);

								if (authUser) {
									console.log("Auto-login successful:", authUser);

									// Make sure we have a username to display
									let displayUsername = authUser.username;
									if (!displayUsername && authUser.email) {
										displayUsername = authUser.email.split('@')[0];
									} else if (!displayUsername) {
										displayUsername = "User";
									}

									// Set user information
									setIsLoggedIn(true);
									setUsername(displayUsername);
									setUserId(authUser.id);

									// Store login info in localStorage
									localStorage.setItem('user_login_info', JSON.stringify({
										isLoggedIn: true,
										username: displayUsername,
										userId: authUser.id,
										deviceId: device.id
									}));

									// Disable kiosk mode after auto-login if there's an active session
									try {
										// Look for active sessions for this device
										const sessions = await pbclient.collection('sessions').getList(1, 1, {
											filter: `device = "${device.id}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
											sort: '-created'
										});

										if (sessions && sessions.items.length > 0) {
											// If there's an active session, disable kiosk mode
											await disableKioskMode();
											console.log("Kiosk mode disabled after auto-login due to active session");
										} else {
											// If there's no active session, enable kiosk mode
											await enableKioskMode();
											console.log("Kiosk mode enabled after auto-login due to no active session");
										}
									} catch (sessionError) {
										console.error("Error checking for active sessions during auto-login:", sessionError);
										// Default to disabling kiosk mode on error
										await disableKioskMode();
										console.log("Kiosk mode disabled after auto-login (default on error)");
									}

									console.log("Auto-login successful, device ID:", device.id);

									// Check if there's an existing session for this device
									try {
										// Look for active sessions for this device with any relevant status
										const sessions = await pbclient.collection('sessions').getList(1, 1, {
											filter: `device = "${device.id}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
											sort: '-created'
										});

										console.log("Session query filter:", `device = "${device.id}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`);

										if (sessions && sessions.items.length > 0) {
											const session = sessions.items[0];
											console.log("Found existing session for device:", session);
											// The SessionManager component will handle displaying this session
										} else {
											console.log("No existing session found for device, a new one will be created");
											// The SessionManager component will create a new session
										}
									} catch (sessionError) {
										console.error("Error checking for existing sessions:", sessionError);
										// Continue anyway, SessionManager will handle session creation
									}

									return true;
								}
							} catch (tokenError) {
								console.error("Error processing token or getting user data:", tokenError);
							}
						} else {
							console.error("Token is invalid");
						}
					} catch (authError) {
						console.error("Error authenticating with token:", authError);
						// Clear the invalid auth data
						pbclient.authStore.clear();
					}
				}
			} else {
				console.log("No devices with tokens found");
			}

			return false;
		} catch (error) {
			console.error("Error during auto-login:", error);
			return false;
		}
	}, [getDevicesList, disableKioskMode]);

	// Setup app initialization
	useEffect(() => {
		// Initialize the app
		const initApp = async () => {
			await getOs();

			// Check if device info is stored in localStorage
			if (parsedDeviceInfo && parsedDeviceInfo.deviceId) {
				console.log("Found device info in localStorage:", parsedDeviceInfo);
				setDeviceId(parsedDeviceInfo.deviceId);

				// Check if user is already logged in
				if (isLoggedIn) {
					// Check if there's an active session
					try {
						const sessions = await pbclient.collection('sessions').getList(1, 1, {
							filter: `device = "${parsedDeviceInfo.deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
							sort: '-created'
						});

						if (sessions && sessions.items.length > 0) {
							// If there's an active session, disable kiosk mode
							await disableKioskMode();
							console.log("Kiosk mode disabled for logged-in user with active session");

							// Update session state
							setHasActiveSession(true);
							setActiveSessionData(sessions.items[0]);
						} else {
							// If there's no active session, enable kiosk mode
							await enableKioskMode();
							console.log("Kiosk mode enabled for logged-in user with no active session");
						}
					} catch (sessionError) {
						console.error("Error checking for active sessions:", sessionError);
						// Default to enabling kiosk mode
						await enableKioskMode();
						console.log("Kiosk mode enabled for logged-in user (default after error)");
					}
				} else {
					// Try auto-login with device token
					const autoLoginSuccessful = await checkDeviceTokenAndLogin();

					if (!autoLoginSuccessful) {
						// If auto-login failed, enable kiosk mode
						await enableKioskMode();
						console.log("Kiosk mode enabled after failed auto-login attempt");
					}
					// If auto-login succeeded, the handleAutoLogin function will handle kiosk mode
				}
			} else {
				console.log("No device info found in localStorage, showing device registration");
				// If no device info, show device registration
				setShowDeviceRegistration(true);
				// Temporarily disable kiosk mode for device registration
				await disableKioskMode();
				console.log("Kiosk mode temporarily disabled for device registration");
			}
		};

		// Listen for custom event to enable kiosk mode
		const handleKioskModeEvent = (event) => {
			console.log("Received enable-kiosk-mode event:", event.detail);

			// If force is true, use a more aggressive approach
			if (event.detail.force) {
				console.log("Force flag is true, using aggressive kiosk mode approach");

				// Try to enable kiosk mode with multiple approaches
				try {
					// First try the normal function
					enableKioskMode(event.detail.reason);

					// Then try direct API calls as backup
					if (typeof neuWindow !== 'undefined') {
						// Set window properties
						neuWindow.setSize({
							width: window.screen.width,
							height: window.screen.height,
							resizable: false,
							borderless: true,
							alwaysOnTop: true,
							maximize: true
						})
							.then(() => console.log("Window size set for kiosk mode"))
							.catch(err => console.error("Error setting window size:", err));

						// Set full screen
						neuWindow.setFullScreen()
							.then(() => console.log("Full screen set for kiosk mode"))
							.catch(err => console.error("Error setting full screen:", err));
					}

					// Set state
					setIsKioskMode(true);

					// Disable keyboard shortcuts
					const handler = (e) => {
						// Prevent Ctrl, Alt, Win, Tab keys
						if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') {
							e.preventDefault();
							e.stopPropagation();
							console.log('Blocked key:', e.key);
							return false;
						}
					};

					// Remove existing handler if any
					if (keyboardHandler.current) {
						document.removeEventListener('keydown', keyboardHandler.current, true);
					}

					// Add new handler
					document.addEventListener('keydown', handler, true);
					keyboardHandler.current = handler;

					console.log("Keyboard shortcuts disabled for kiosk mode");
				} catch (error) {
					console.error("Error in aggressive kiosk mode approach:", error);
				}
			} else {
				// Normal approach
				enableKioskMode(event.detail.reason);
			}
		};

		// Add event listener
		window.addEventListener('enable-kiosk-mode', handleKioskModeEvent);

		// Clean up event listener
		return () => {
			window.removeEventListener('enable-kiosk-mode', handleKioskModeEvent);
		};

		// Register app exit handler
		const setupExitHandler = async () => {
			events.on('windowClose', () => {
				console.log('Window closing, exiting app');
				app.exit();
			});
		};

		// Set up time update interval
		updateTime(); // Initial update
		const timeInterval = setInterval(updateTime, 1000);

		// Run initialization
		initApp();
		setupExitHandler();

		// Cleanup function
		return () => {
			clearInterval(timeInterval);
			if (keyboardHandler.current) {
				document.removeEventListener('keydown', keyboardHandler.current, true);
			}
		};
	}, [getOs, parsedDeviceInfo, isLoggedIn, enableKioskMode, checkDeviceTokenAndLogin, disableKioskMode]);

	return (
		<div className="w-full min-h-screen flex flex-col justify-center items-center">
			{/* Session state manager - invisible component that manages session state */}
			{deviceId && <SessionStateManager deviceId={deviceId} onSessionStateChange={handleSessionStateChange} />}

			{/* Device token monitor - invisible component that monitors device token */}
			{deviceId && <DeviceTokenMonitor deviceId={deviceId} onAutoLogin={handleAutoLogin} />}

			{/* Screenshot monitor - invisible component that monitors for screenshot requests */}
			{deviceId && isLoggedIn && <ScreenshotMonitor deviceId={deviceId} />}

			{showDeviceRegistration ? (
				<div className="mt-16">
					<DeviceRegistration onDeviceRegistered={handleDeviceRegistered} />
				</div>
			) : !isLoggedIn ? (
				<>
					{isKioskMode && (
						<div className="fixed top-0 left-0 w-full bg-black text-white p-4 flex justify-between items-center">
							<div className="text-xl font-bold">{currentTime}</div>
							<div className="text-sm">{currentDate}</div>
							<div className="text-sm">{whichOs}</div>
						</div>
					)}
					<div className="mt-16">
						<Login onLogin={handleLogin} isKioskMode={isKioskMode} />
					</div>
				</>
			) : (
				<>
					<div className="w-full max-w-6xl p-4">
						<div className="flex justify-between items-center mb-6">
							<h1 className="text-2xl font-bold">Welcome, {username}!</h1>
							<div className="flex items-center gap-4">
								<Label>Current Time: {currentTime}</Label>
								<ModeToggle />
								<Button
									variant="destructive"
									onClick={async () => {
										try {
											// Get device ID and session ID from localStorage
											const savedInfo = localStorage.getItem('user_login_info');
											let deviceId = null;

											if (savedInfo) {
												const parsedInfo = JSON.parse(savedInfo);
												deviceId = parsedInfo.deviceId;
											}

											// Close active session if exists
											if (deviceId) {
												try {
													// Find active session for this device with any relevant status
													const sessions = await pbclient.collection('sessions').getList(1, 1, {
														filter: `device = "${deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
														sort: '-created'
													});

													console.log("Session query filter:", `device = "${deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`);

													if (sessions && sessions.items.length > 0) {
														const session = sessions.items[0];
														console.log("Closing session:", session.id);

														// Calculate session cost
														let sessionCost = session.session_total || 0;
														let discountAmount = 0;
														let discountRate = 0;

														// Update session with closed status and payment details
														await pbclient.collection('sessions').update(session.id, {
															status: 'Closed',
															amount_paid: sessionCost,
															discount_amount: discountAmount,
															discount_rate: discountRate
														});

														// Create session log entry
														await pbclient.collection('session_logs').create({
															session_id: session.id,
															type: 'Closed',
															session_amount: sessionCost
														});

														console.log("Session closed successfully");
													}

													// Update device status to Available
													await pbclient.collection('devices').update(deviceId, {
														status: 'Available',
														token: '',
														client_record: ''
													});

													console.log("Device status updated to Available");
												} catch (sessionError) {
													console.error("Error closing session:", sessionError);
												}
											}

											// Log out from PocketBase
											logout();

											// Clear login state
											setIsLoggedIn(false);
											setUsername('');
											setUserId(null);

											// Clear saved login info
											localStorage.removeItem('user_login_info');
											// Clear client app login flag
											localStorage.removeItem('client_app_login');

											// Enable kiosk mode using the aggressive approach
											try {
												console.log("Enabling kiosk mode after manual logout");

												// Dispatch event with force flag
												const kioskEvent = new CustomEvent('enable-kiosk-mode', {
													detail: { reason: 'manual-logout', force: true }
												});
												window.dispatchEvent(kioskEvent);

												// Also call the function directly as backup
												enableKioskMode('manual-logout');

												console.log('User logged out and kiosk mode enabled');
											} catch (kioskError) {
												console.error("Error enabling kiosk mode after logout:", kioskError);
											}
										} catch (error) {
											console.error("Error during logout:", error);

											// Ensure logout happens even if there are errors
											logout();
											setIsLoggedIn(false);
											setUsername('');
											setUserId(null);
											localStorage.removeItem('user_login_info');
											// Dispatch event with force flag
											const kioskEvent = new CustomEvent('enable-kiosk-mode', {
												detail: { reason: 'error-logout', force: true }
											});
											window.dispatchEvent(kioskEvent);
										}
									}}
								>
									Logout
								</Button>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{/* Session information */}
							<SessionManager
								userId={userId}
								activeSession={hasActiveSession}
								sessionData={activeSessionData}
							/>

							{/* Snacks information */}
							<SnacksInfo />
						</div>

						<div className="mt-6 p-4 border rounded-lg">
							<div className="flex justify-between items-center">
								<div>
									<Label htmlFor="osinfo">System: {whichOs}</Label>
									<div className="mt-2">
										<Label className={isKioskMode ? "text-destructive" : "text-green-500"}>
											Kiosk Mode: {isKioskMode ? 'Enabled' : 'Disabled'}
										</Label>
									</div>
								</div>
								<div className="text-sm text-muted-foreground">
									{currentDate}
								</div>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

export default App;

