import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { useCollection } from '@/hooks/useCollection';
import { useRealtimePb } from '@/hooks/useRealtimePb';
import { pbclient } from '@/lib/pocketbase/pb';

/**
 * Component for managing and displaying session information
 */
function SessionManager({ userId, activeSession, sessionData: sessionDataProp }) {
  const [sessionId, setSessionId] = useState(null);
  const [inTime, setInTime] = useState(null);
  const [outTime, setOutTime] = useState(null);
  const [remainingTime, setRemainingTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [sessionCost, setSessionCost] = useState(0);

  // Use the sessions collection
  const { create, getList, update } = useCollection('sessions');

  // Subscribe to real-time updates for the current session
  const { data: sessionData } = useRealtimePb(
    'sessions',
    sessionId ? `id = "${sessionId}"` : ''
  );

  // Function to fetch device group and calculate session cost
  const fetchDeviceGroupAndCalculateCost = useCallback(async (deviceId, durationHours = 1) => {
    if (!deviceId) {
      console.log("No device ID provided, cannot fetch group info");
      return 0;
    }

    try {
      // First, get the device details
      const device = await pbclient.collection('devices').getOne(deviceId);
      setDeviceInfo(device);

      if (device && device.group) {
        // Get the group information
        const group = await pbclient.collection('groups').getOne(device.group);
        setGroupInfo(group);

        if (group && group.price) {
          // Calculate the session cost based on the group's price per hour
          const hourlyRate = parseFloat(group.price);

          // Ensure duration is a valid number
          let validDuration = durationHours;
          if (isNaN(validDuration) || validDuration <= 0) {
            console.warn("Invalid duration provided, defaulting to 1 hour");
            validDuration = 1;
          }

          // Calculate base cost: hourly rate * duration in hours
          const baseCost = hourlyRate * validDuration;
          console.log(`BASE COST CALCULATION: ₹${hourlyRate} per hour × ${validDuration.toFixed(2)} hours = ₹${baseCost.toFixed(2)}`);

          // Check for happy hour discounts
          let finalCost = baseCost;
          let discountRate = 0;
          let discountAmount = 0;
          let happyHourApplied = false;

          try {
            // Get current date and time
            const now = new Date();
            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
            const currentTime = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

            console.log(`Checking for happy hours: Day=${currentDay}, Time=${currentTime}`);

            // Query happy hours for this group that are active and match current day
            const happyHours = await pbclient.collection('happy_hours').getList(1, 50, {
              filter: `group = "${group.id}" && status = "Active" && days = "${currentDay}"`
            });

            if (happyHours && happyHours.items.length > 0) {
              console.log(`Found ${happyHours.items.length} potential happy hour(s) for ${currentDay}`);

              // Check each happy hour to see if current time falls within its range
              for (const happyHour of happyHours.items) {
                const startTime = happyHour.start_time;
                const endTime = happyHour.end_time;

                // Check if current time is within happy hour range
                if (currentTime >= startTime && currentTime <= endTime) {
                  console.log(`Happy hour active: ${startTime} - ${endTime}`);

                  // Apply discount based on type (percentage or fixed rate)
                  if (happyHour.discount_percentage && happyHour.discount_percentage > 0) {
                    // Apply percentage discount
                    discountRate = parseFloat(happyHour.discount_percentage);
                    discountAmount = baseCost * (discountRate / 100);
                    finalCost = baseCost - discountAmount;

                    console.log(`Applied ${discountRate}% discount: -₹${discountAmount.toFixed(2)}`);
                    happyHourApplied = true;
                  } else if (happyHour.fixed_rate && happyHour.fixed_rate > 0) {
                    // Apply fixed rate (override hourly rate)
                    const fixedRate = parseFloat(happyHour.fixed_rate);
                    finalCost = fixedRate * validDuration;
                    discountAmount = baseCost - finalCost;

                    // Calculate effective discount rate
                    if (baseCost > 0) {
                      discountRate = (discountAmount / baseCost) * 100;
                    }

                    console.log(`Applied fixed rate: ₹${fixedRate}/hour instead of ₹${hourlyRate}/hour`);
                    console.log(`Discount: -₹${discountAmount.toFixed(2)} (${discountRate.toFixed(2)}%)`);
                    happyHourApplied = true;
                  }

                  // Only apply the first matching happy hour
                  break;
                }
              }
            } else {
              console.log(`No happy hours found for group ${group.id} on ${currentDay}`);
            }
          } catch (happyHourError) {
            console.error("Error checking for happy hours:", happyHourError);
          }

          // Set the final session cost
          setSessionCost(finalCost);

          if (happyHourApplied) {
            console.log(`FINAL COST (with happy hour): ₹${finalCost.toFixed(2)} (Discount: ₹${discountAmount.toFixed(2)})`);
          } else {
            console.log(`FINAL COST (no happy hour): ₹${finalCost.toFixed(2)}`);
          }

          // Return an object with all cost details
          return {
            baseCost,
            finalCost,
            discountRate,
            discountAmount,
            happyHourApplied
          };
        } else {
          console.log("Group has no price information");
          setSessionCost(0);
        }
      } else {
        console.log("Device has no group assigned");
        setSessionCost(0);
      }
    } catch (error) {
      console.error("Error fetching device group or calculating cost:", error);
      setSessionCost(0);
    }

    return {
      baseCost: 0,
      finalCost: 0,
      discountRate: 0,
      discountAmount: 0,
      happyHourApplied: false
    };
  }, []);

  // Function to create a new session
  const createSession = useCallback(async () => {
    setLoading(true);
    try {
      // Default session duration is 1 hour
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      console.log("Creating session with times:", {
        in_time: now.toISOString(),
        out_time: oneHourLater.toISOString()
      });

      // Get device ID from localStorage if available
      let deviceId = null;
      try {
        // First check user_login_info for device ID
        const savedInfo = localStorage.getItem('user_login_info');
        if (savedInfo) {
          const parsedInfo = JSON.parse(savedInfo);
          if (parsedInfo.deviceId) {
            deviceId = parsedInfo.deviceId;
            console.log("Using device ID from user_login_info:", deviceId);
          }
        }

        // If not found in user_login_info, check device_info
        if (!deviceId) {
          const savedDeviceInfo = localStorage.getItem('device_info');
          if (savedDeviceInfo) {
            const parsedDeviceInfo = JSON.parse(savedDeviceInfo);
            if (parsedDeviceInfo.deviceId) {
              deviceId = parsedDeviceInfo.deviceId;
              console.log("Using device ID from device_info:", parsedDeviceInfo.deviceId);
            }
          }
        }

        // If we have a device ID, get device information
        if (deviceId) {
          try {
            const device = await pbclient.collection('devices').getOne(deviceId);
            setDeviceInfo(device);
            console.log("Found device information:", device);
          } catch (deviceFetchError) {
            console.error("Error fetching device info:", deviceFetchError);
          }
        }

        // If no device ID in localStorage, try to get a default one
        if (!deviceId) {
          console.log("No device ID in localStorage, looking for available device");
          const devices = await pbclient.collection('devices').getList(1, 1, {
            filter: 'status = "Available"'
          });

          if (devices && devices.items && devices.items.length > 0) {
            deviceId = devices.items[0].id;
            setDeviceInfo(devices.items[0]);
            console.log("Using default device:", devices.items[0]);
          }
        }
      } catch (deviceError) {
        console.error("Error getting device ID:", deviceError);
        // Continue without device ID
      }

      // Format dates according to PocketBase date field format (ISO string)
      const sessionData = {
        in_time: now.toISOString(),
        out_time: oneHourLater.toISOString(),
        duration: 60, // 60 minutes
        session_total: 0, // Will be calculated later
        snacks_total: 0,
        total_amount: 0,
        amount_paid: 0,
        discount_amount: 0,
        discount_rate: 0,
        Cash: 0,
        UPI: 0,
        status: 'Active',
        payment_mode: 'Cash',
        payment_type: 'Pre-paid'
      };

      // Only add device if we have a valid device ID
      if (deviceId) {
        sessionData.device = deviceId;

        // Calculate session cost based on device group
        const costDetails = await fetchDeviceGroupAndCalculateCost(deviceId, 1); // 1 hour session

        // Update session data with calculated cost and discount information
        sessionData.session_total = costDetails.finalCost || 0;
        sessionData.total_amount = costDetails.finalCost || 0;
        sessionData.discount_amount = costDetails.discountAmount || 0;
        sessionData.discount_rate = costDetails.discountRate || 0;
      }

      const newSession = await create(sessionData);

      if (!newSession) {
        throw new Error("Failed to create session - no session data returned");
      }

      console.log("Session created successfully:", newSession);

      setSessionId(newSession.id);

      // Ensure dates are properly parsed
      if (newSession.in_time) {
        const parsedInTime = new Date(newSession.in_time);
        console.log("Setting in_time:", parsedInTime);
        setInTime(parsedInTime);
      }

      if (newSession.out_time) {
        const parsedOutTime = new Date(newSession.out_time);
        console.log("Setting out_time:", parsedOutTime);
        setOutTime(parsedOutTime);
      }

      setIsSessionActive(true);

      // Create a session log entry
      try {
        await pbclient.collection('session_logs').create({
          session_id: newSession.id,
          type: 'Create',
          session_amount: 0,
          client: userId
        });
      } catch (logError) {
        console.error("Error creating session log:", logError);
        // Continue even if log creation fails
      }

      return newSession;
    } catch (err) {
      console.error('Error creating session:', err);
      setError('Failed to create session: ' + (err.message || 'Unknown error'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [create, fetchDeviceGroupAndCalculateCost]);

  // State to track if notification has been shown
  const [notificationShown, setNotificationShown] = useState(false);

  // Function to show notification - defined before it's used in checkExistingSession
  const showNotification = useCallback((message, isSystemNotification = false) => {
    // Create a notification element for in-app notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white p-4 rounded-md shadow-lg z-50 max-w-md';
    notification.style.animation = 'fadeIn 0.5s, fadeOut 0.5s 9.5s';
    notification.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>${message}</div>
        </div>
        <button class="ml-4 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);

    // Add to document
    document.body.appendChild(notification);

    // Remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 10000);

    // Show OS-level notification if requested
    if (isSystemNotification) {
      try {
        // Try Neutralino API first (for desktop apps)
        if (window.Neutralino && window.Neutralino.os && window.Neutralino.os.showNotification) {
          window.Neutralino.os.showNotification({
            summary: 'Session Alert',
            body: message
          });
          console.log("System notification sent via Neutralino:", message);
        }
        // Fallback to Web Notifications API (works in browsers)
        else if ('Notification' in window) {
          // Request permission if needed
          if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                new Notification('Session Alert', { body: message });
                console.log("System notification sent via Web Notifications API:", message);
              }
            });
          } else {
            new Notification('Session Alert', { body: message });
            console.log("System notification sent via Web Notifications API:", message);
          }
        } else {
          console.warn("No notification API available");
        }
      } catch (error) {
        console.error("Error showing system notification:", error);
      }
    }
  }, []);

  console.log("Device Id", deviceInfo?.id)

  // Function to check for existing session
  const checkExistingSession = useCallback(async () => {
    try {
      console.log("Checking for existing sessions");

      // Get device ID from localStorage if available
      let deviceId = null;
      try {
        // First check user_login_info for device ID
        const savedInfo = localStorage.getItem('user_login_info');
        if (savedInfo) {
          const parsedInfo = JSON.parse(savedInfo);
          if (parsedInfo.deviceId) {
            deviceId = parsedInfo.deviceId;
            console.log("Found device ID in user_login_info:", deviceId);
          }
        }

        // If not found in user_login_info, check device_info
        if (!deviceId) {
          const savedDeviceInfo = localStorage.getItem('device_info');
          if (savedDeviceInfo) {
            const parsedDeviceInfo = JSON.parse(savedDeviceInfo);
            if (parsedDeviceInfo.deviceId) {
              deviceId = parsedDeviceInfo.deviceId;
              console.log("Found device ID in device_info:", parsedDeviceInfo.deviceId);
            }
          }
        }
      } catch (localStorageError) {
        console.error("Error reading device ID from localStorage:", localStorageError);
      }

      // If no device ID, we can't check for sessions
      if (!deviceId) {
        console.log("No device ID found, cannot check for sessions");
        return null;
      }

      console.log("Checking sessions for device ID:", deviceId);

      // Check for any active or booked session for this device
      const allSessions = await getList(1, 1, '-created', `device = "${deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`);
      console.log("Session query filter:", `device = "${deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`);

      if (allSessions && allSessions.length > 0) {
        const session = allSessions[0];
        console.log('Found session for device:', session);

        setSessionId(session.id);

        // Ensure dates are properly parsed
        let parsedInTime = null;
        let parsedOutTime = null;

        if (session.in_time) {
          parsedInTime = new Date(session.in_time);
          console.log("Setting in_time from session:", parsedInTime);
          setInTime(parsedInTime);
        }

        if (session.out_time) {
          parsedOutTime = new Date(session.out_time);
          console.log("Setting out_time from session:", parsedOutTime);
          setOutTime(parsedOutTime);
        }

        // Check session status
        if (session.status === "Active" || session.status === "Booked" || session.status === "Occupied" || session.status === "Extended") {
          console.log(`Session is ${session.status}, treating as active`);

          // If session is from server, update it to Active status
          if (session.status === "Booked" || session.status === "Occupied") {
            try {
              await update(session.id, { status: "Active" });
              console.log("Updated session status from", session.status, "to Active");
            } catch (updateError) {
              console.error("Error updating session status:", updateError);
            }
          }

          setIsSessionActive(true);

          // Check if out_time has passed
          if (parsedOutTime) {
            const now = new Date();
            if (now > parsedOutTime) {
              console.log("Session has ended (out_time has passed)");
              setIsSessionActive(false);

              // Show session ended notification
              showNotification('Your session has ended.');
            } else {
              console.log("Session is still valid (out_time has not passed)");
              setIsSessionActive(true);
            }
          }
        } else if (session.status === "Closed") {
          console.log("Session is Closed");
          setIsSessionActive(false);

          // Show session ended notification
          showNotification('Your session has ended.');
        } else {
          console.log(`Unknown session status: ${session.status}`);
          setIsSessionActive(false);
        }

        // Get device information and calculate session cost if available
        if (session.device) {
          try {
            // Calculate session duration in hours
            let durationHours = 1; // Default to 1 hour

            // First check if the session has a duration field
            if (session.duration) {
              // Duration is stored in minutes, convert to hours
              durationHours = session.duration / 60;
              console.log(`Using session duration from record: ${durationHours.toFixed(2)} hours (${session.duration} minutes)`);
            }
            // If no duration field or it's zero, calculate from in_time and out_time
            else if (session.in_time && session.out_time) {
              const inTime = new Date(session.in_time);
              const outTime = new Date(session.out_time);

              if (!isNaN(inTime.getTime()) && !isNaN(outTime.getTime())) {
                // Calculate duration in hours
                const durationMs = outTime - inTime;
                durationHours = durationMs / (1000 * 60 * 60);
                console.log(`Calculated session duration: ${durationHours.toFixed(2)} hours`);
              }
            }

            console.log(`DURATION CHECK: Session duration is ${durationHours.toFixed(2)} hours`);

            // Fetch device group and calculate cost
            const calculatedCost = await fetchDeviceGroupAndCalculateCost(session.device, durationHours);

            // If the session already has a session_total, use that instead
            if (session.session_total && session.session_total > 0) {
              console.log(`Session already has a cost: ₹${session.session_total} (using this instead of calculated cost: ₹${calculatedCost})`);
              setSessionCost(session.session_total);
            }
          } catch (deviceErr) {
            console.error('Error fetching device info or calculating cost:', deviceErr);
          }
        }

        return session;
      } else {
        console.log("No sessions found for this device");
      }

      return null;
    } catch (err) {
      console.error('Error checking for existing session:', err);
      setError('Failed to check for existing session: ' + (err.message || 'Unknown error'));
      return null;
    }
  }, [getList, showNotification, fetchDeviceGroupAndCalculateCost]);

  // Function to update remaining time
  const updateRemainingTime = useCallback(async () => {
    if (!outTime) {
      setRemainingTime({ hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    try {
      const now = new Date();
      const end = new Date(outTime);

      // Validate that outTime is a valid date
      if (isNaN(end.getTime())) {
        console.error('Invalid outTime date:', outTime);
        setRemainingTime({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      // Calculate difference in milliseconds
      let diff = end - now;

      // If time is up, set all values to 0
      if (diff <= 0) {
        setRemainingTime({ hours: 0, minutes: 0, seconds: 0 });

        // Check if the session has truly expired (gone into yesterday)
        const now = new Date();
        const endDate = new Date(outTime);
        const isYesterday = now.getDate() > endDate.getDate() ||
                           now.getMonth() > endDate.getMonth() ||
                           now.getFullYear() > endDate.getFullYear();

        // If session is active and time is up, we should notify and log out the user
        if (isSessionActive && sessionId && !notificationShown) {
          if (isYesterday) {
            // If it's gone into yesterday, we'll close the session
            showNotification('Your session has ended. The system will log you out in 5 seconds.', true);
          } else {
            // Even if it hasn't gone into yesterday, we'll still log out the user
            showNotification('Your session time has ended. The system will log you out in 5 seconds.', true);
          }
          setNotificationShown(true);

          // Auto logout after session ends (regardless of whether it's gone into yesterday)
          setTimeout(() => {
            try {
              // Clear localStorage
              localStorage.removeItem('user_login_info');
              // Clear client app login flag
              localStorage.removeItem('client_app_login');

              // Don't reload the page, just clear auth store
              pbclient.authStore.clear();
              console.log("Auth store cleared instead of page reload");

              // Show another notification about logout
              showNotification('You have been logged out due to session expiration.', true);

              // Enable kiosk mode
              try {
                console.log("Enabling kiosk mode after session end");

                // First try direct Neutralino API call
                if (window.Neutralino && window.Neutralino.window) {
                  try {
                    window.Neutralino.window.setFullScreen(true)
                      .then(() => console.log("Kiosk mode enabled directly via Neutralino API"))
                      .catch(directError => console.error("Error enabling kiosk mode directly:", directError));
                  } catch (directError) {
                    console.error("Error enabling kiosk mode directly:", directError);
                  }
                }

                // Always dispatch the event as a backup
                const kioskEvent = new CustomEvent('enable-kiosk-mode', {
                  detail: { reason: 'session-ended', force: true }
                });
                window.dispatchEvent(kioskEvent);
                console.log("Dispatched enable-kiosk-mode event");

                // As a final fallback, try to reload the page after a short delay
                setTimeout(() => {
                  try {
                    console.log("Reloading page as final fallback for kiosk mode");
                    window.location.reload();
                  } catch (reloadError) {
                    console.error("Error reloading page:", reloadError);
                  }
                }, 1000); // Wait 1 second before reload
              } catch (kioskError) {
                console.error("Error in kiosk mode enabling process:", kioskError);
              }

              console.log("Auto logout triggered after session end");
            } catch (logoutError) {
              console.error("Error during auto logout:", logoutError);
            }
          }, 5000); // Wait 5 seconds before logout
        }

        // Only close the session in the database if it's active, has an ID, and the time has gone into yesterday
        if (isSessionActive && sessionId && isYesterday) {
          console.log("Session time has gone into yesterday, updating status to Closed");

          // Update session status to Closed if it's still active
          try {
            // Get device ID from localStorage or from session data
            let deviceId = null;

            // First check if we have device info already
            if (deviceInfo && deviceInfo.id) {
              deviceId = deviceInfo.id;
              console.log("Using device ID from deviceInfo:", deviceId);
            } else {
              try {
                // First check user_login_info for device ID
                const savedInfo = localStorage.getItem('user_login_info');
                if (savedInfo) {
                  const parsedInfo = JSON.parse(savedInfo);
                  if (parsedInfo.deviceId) {
                    deviceId = parsedInfo.deviceId;
                    console.log("Using device ID from user_login_info:", deviceId);
                  }
                }

                // If not found in user_login_info, check device_info
                if (!deviceId) {
                  const savedDeviceInfo = localStorage.getItem('device_info');
                  if (savedDeviceInfo) {
                    const parsedDeviceInfo = JSON.parse(savedDeviceInfo);
                    if (parsedDeviceInfo.deviceId) {
                      deviceId = parsedDeviceInfo.deviceId;
                      console.log("Using device ID from device_info:", deviceId);
                    }
                  }
                }
              } catch (localStorageError) {
                console.error("Error reading device ID from localStorage:", localStorageError);
              }
            }

            // Get the latest cost details with happy hour pricing
            let cost = sessionCost || 0;
            let discountAmount = 0;
            let discountRate = 0;

            // Recalculate with happy hour pricing if we have device info
            if (deviceInfo && deviceInfo.id) {
              try {
                // Calculate duration from in_time and out_time
                const inTimeDate = new Date(inTime);
                const outTimeDate = new Date(outTime);
                const durationHours = (outTimeDate - inTimeDate) / (1000 * 60 * 60);

                // Get cost details with happy hour pricing
                const costDetails = await fetchDeviceGroupAndCalculateCost(deviceInfo.id, durationHours);

                // Update cost and discount information
                cost = costDetails.finalCost || 0;
                discountAmount = costDetails.discountAmount || 0;
                discountRate = costDetails.discountRate || 0;

                if (costDetails.happyHourApplied) {
                  console.log(`Happy hour pricing applied to session ${sessionId}`);
                }
              } catch (costError) {
                console.error("Error calculating final cost with happy hour pricing:", costError);
              }
            }

            console.log(`Closing session ${sessionId} with cost: ₹${cost} (Discount: ₹${discountAmount} at ${discountRate}%)`);

            // Update session with closed status and payment details
            await update(sessionId, {
              status: 'Closed',
              amount_paid: cost,
              discount_amount: discountAmount,
              discount_rate: discountRate,
              session_total: cost,
              total_amount: cost
            });

            console.log("Session status updated to Closed");

            // Create a session log entry for closing
            await pbclient.collection('session_logs').create({
              session_id: sessionId,
              type: 'Closed',
              session_amount: cost
            });

            console.log("Session log entry created for session closure");

            // Update device status to Available
            if (deviceId) {
              try {
                await pbclient.collection('devices').update(deviceId, {
                  status: 'Available',
                  token: '',
                  client_record: ''
                });
                console.log("Device status updated to Available");
              } catch (deviceUpdateError) {
                console.error("Error updating device status:", deviceUpdateError);
              }
            } else {
              console.warn("No device ID found, cannot update device status");
            }

            setIsSessionActive(false);

            // Show session ended notification if not already shown
            if (!notificationShown) {
              // Use system notification with high priority
              showNotification('Your session has ended. The system will log you out in 5 seconds.', true);
              setNotificationShown(true);
              console.log("Session ended notification shown");

              // Auto logout after session ends
              setTimeout(() => {
                try {
                  // Clear localStorage
                  localStorage.removeItem('user_login_info');
                  // Clear client app login flag
                  localStorage.removeItem('client_app_login');

                  // Don't reload the page, just clear auth store
                  pbclient.authStore.clear();
                  console.log("Auth store cleared instead of page reload");

                  // Show another notification about logout
                  showNotification('You have been logged out due to session expiration.', true);

                  // Enable kiosk mode
                  try {
                    console.log("Enabling kiosk mode after session end");

                    // First try direct Neutralino API call
                    if (window.Neutralino && window.Neutralino.window) {
                      try {
                        window.Neutralino.window.setFullScreen(true)
                          .then(() => console.log("Kiosk mode enabled directly via Neutralino API"))
                          .catch(directError => console.error("Error enabling kiosk mode directly:", directError));
                      } catch (directError) {
                        console.error("Error enabling kiosk mode directly:", directError);
                      }
                    }

                    // Always dispatch the event as a backup
                    const kioskEvent = new CustomEvent('enable-kiosk-mode', {
                      detail: { reason: 'session-ended', force: true }
                    });
                    window.dispatchEvent(kioskEvent);
                    console.log("Dispatched enable-kiosk-mode event");

                    // As a final fallback, try to reload the page after a short delay
                    // This will force the app to restart in its initial state (kiosk mode)
                    setTimeout(() => {
                      try {
                        console.log("Reloading page as final fallback for kiosk mode");
                        window.location.reload();
                      } catch (reloadError) {
                        console.error("Error reloading page:", reloadError);
                      }
                    }, 1000); // Wait 1 second before reload
                  } catch (kioskError) {
                    console.error("Error in kiosk mode enabling process:", kioskError);
                  }

                  console.log("Auto logout triggered after session end");
                } catch (logoutError) {
                  console.error("Error during auto logout:", logoutError);
                }
              }, 5000); // Wait 5 seconds before logout
            }
          } catch (updateError) {
            console.error("Error updating session status:", updateError);

            // Even if update fails, still show notification
            if (!notificationShown) {
              showNotification('Your session has ended, but there was an error updating the session status.', true);
              setNotificationShown(true);
            }
          }
        }
        return;
      }

      // Convert to hours, minutes, seconds
      const hours = Math.floor(diff / (1000 * 60 * 60));
      diff -= hours * (1000 * 60 * 60);

      const minutes = Math.floor(diff / (1000 * 60));
      diff -= minutes * (1000 * 60);

      const seconds = Math.floor(diff / 1000);

      setRemainingTime({ hours, minutes, seconds });

      // Show notification 5 minutes before session ends
      const totalMinutesLeft = hours * 60 + minutes;

      if (isSessionActive && sessionId) {
        if (totalMinutesLeft <= 5 && totalMinutesLeft > 0 && !notificationShown) {
          console.log(`Session ending soon: ${totalMinutesLeft} minutes remaining`);
          showNotification(`Your session will end in ${totalMinutesLeft} minutes. Please save your work.`, true); // Use system notification
          setNotificationShown(true);
        }

        // Reset notification flag if more than 5 minutes left
        if (totalMinutesLeft > 5 && notificationShown) {
          setNotificationShown(false);
        }
      }
    } catch (error) {
      console.error('Error calculating remaining time:', error);
      setRemainingTime({ hours: 0, minutes: 0, seconds: 0 });
    }
  }, [outTime, isSessionActive, sessionId, update, notificationShown, showNotification, deviceInfo, sessionCost]);

  // Function to check if the device has a token or client_record
  const checkDeviceTokenAndRecord = useCallback(async (deviceId) => {
    if (!deviceId) return null;

    try {
      console.log("Checking device token and client_record for device:", deviceId);

      // Get the device details
      const device = await pbclient.collection('devices').getOne(deviceId);

      if (device && (device.token || device.client_record)) {
        console.log("Device has token or client_record:", {
          token: device.token ? "Present" : "Not present",
          client_record: device.client_record ? "Present" : "Not present"
        });

        // If the device has a token or client_record, it means a session was created from the server app
        return device;
      }

      return null;
    } catch (error) {
      console.error("Error checking device token and client_record:", error);
      return null;
    }
  }, []);

  // Initialize session on component mount or when activeSession/sessionData changes
  useEffect(() => {
    const initSession = async () => {
      setLoading(true);
      console.log("Initializing session with props:", { activeSession, sessionDataProp });

      try {
        // If we have session data from props, use it
        if (activeSession && sessionDataProp) {
          console.log("Using session data from props:", sessionDataProp);

          setSessionId(sessionDataProp.id);

          // Set in_time and out_time
          if (sessionDataProp.in_time) {
            const parsedInTime = new Date(sessionDataProp.in_time);
            console.log("Setting in_time from props:", parsedInTime);
            setInTime(parsedInTime);
          }

          if (sessionDataProp.out_time) {
            const parsedOutTime = new Date(sessionDataProp.out_time);
            console.log("Setting out_time from props:", parsedOutTime);
            setOutTime(parsedOutTime);
          }

          // Set session as active
          setIsSessionActive(true);

          // Calculate session cost
          if (sessionDataProp.device) {
            try {
              // Calculate session duration in hours
              let durationHours = 1; // Default to 1 hour

              // First check if the session has a duration field
              if (sessionDataProp.duration) {
                // Duration is stored in minutes, convert to hours
                durationHours = sessionDataProp.duration / 60;
                console.log(`Using session duration from record: ${durationHours.toFixed(2)} hours (${sessionDataProp.duration} minutes)`);
              }
              // If no duration field or it's zero, calculate from in_time and out_time
              else if (sessionDataProp.in_time && sessionDataProp.out_time) {
                const inTime = new Date(sessionDataProp.in_time);
                const outTime = new Date(sessionDataProp.out_time);

                if (!isNaN(inTime.getTime()) && !isNaN(outTime.getTime())) {
                  // Calculate duration in hours
                  const durationMs = outTime - inTime;
                  durationHours = durationMs / (1000 * 60 * 60);
                  console.log(`Calculated session duration: ${durationHours.toFixed(2)} hours`);
                }
              }

              console.log(`DURATION CHECK: Session duration is ${durationHours.toFixed(2)} hours`);

              // Fetch device group and calculate cost
              const calculatedCost = await fetchDeviceGroupAndCalculateCost(sessionDataProp.device, durationHours);

              // If the session already has a session_total, use that instead
              if (sessionDataProp.session_total && sessionDataProp.session_total > 0) {
                console.log(`Session already has a cost: ₹${sessionDataProp.session_total} (using this instead of calculated cost: ₹${calculatedCost})`);
                setSessionCost(sessionDataProp.session_total);
              }
            } catch (deviceErr) {
              console.error('Error fetching device info or calculating cost:', deviceErr);
            }
          }

          return;
        }

        // If no session data from props, check for existing session
        let existingSession = await checkExistingSession();

        if (existingSession) {
          console.log("Found existing session:", existingSession);

          // Check session status and timing
          const now = new Date();
          const outTime = existingSession.out_time ? new Date(existingSession.out_time) : null;
          const inTime = existingSession.in_time ? new Date(existingSession.in_time) : null;

          // Calculate session duration for cost calculation
          let totalDurationHours = 1; // Default to 1 hour

          // First check if the session has a duration field
          if (existingSession.duration) {
            // Duration is stored in minutes, convert to hours
            totalDurationHours = existingSession.duration / 60;
            console.log(`Using session duration from record: ${totalDurationHours.toFixed(2)} hours (${existingSession.duration} minutes)`);
          }
          // If no duration field or it's zero, calculate from in_time and out_time
          else if (inTime && outTime && !isNaN(inTime.getTime()) && !isNaN(outTime.getTime())) {
            totalDurationHours = (outTime - inTime) / (1000 * 60 * 60);
            console.log(`Calculated session duration: ${totalDurationHours.toFixed(2)} hours`);
          }

          console.log(`INIT SESSION DURATION CHECK: Session duration is ${totalDurationHours.toFixed(2)} hours`);

          // If the session doesn't have a cost already, calculate it
          if (!existingSession.session_total || existingSession.session_total <= 0) {
            if (existingSession.device) {
              await fetchDeviceGroupAndCalculateCost(existingSession.device, totalDurationHours);
            }
          } else {
            console.log(`Using existing session cost: ₹${existingSession.session_total}`);
            setSessionCost(existingSession.session_total);
          }

          if (outTime) {
            // Calculate time difference
            const diffMs = outTime - now;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));

            // Check if the session has truly expired (gone into yesterday)
            const endDate = new Date(outTime);
            const isYesterday = now.getDate() > endDate.getDate() ||
                               now.getMonth() > endDate.getMonth() ||
                               now.getFullYear() > endDate.getFullYear();

            // If session time is up, we should notify and log out the user
            if (diffMs <= 0 && !notificationShown) {
              if (isYesterday) {
                // If it's gone into yesterday, we'll close the session
                showNotification('Your session has ended. The system will log you out in 5 seconds.', true);
              } else {
                // Even if it hasn't gone into yesterday, we'll still log out the user
                showNotification('Your session time has ended. The system will log you out in 5 seconds.', true);
              }
              setNotificationShown(true);

              // Auto logout after session ends (regardless of whether it's gone into yesterday)
              setTimeout(() => {
                try {
                  // Clear localStorage
                  localStorage.removeItem('user_login_info');

                  // Don't reload the page, just clear auth store
                  pbclient.authStore.clear();
                  console.log("Auth store cleared instead of page reload");

                  // Enable kiosk mode
                  try {
                    console.log("Enabling kiosk mode after session end");

                    // First try direct Neutralino API call
                    if (window.Neutralino && window.Neutralino.window) {
                      try {
                        window.Neutralino.window.setFullScreen(true)
                          .then(() => console.log("Kiosk mode enabled directly via Neutralino API"))
                          .catch(directError => console.error("Error enabling kiosk mode directly:", directError));
                      } catch (directError) {
                        console.error("Error enabling kiosk mode directly:", directError);
                      }
                    }

                    // Always dispatch the event as a backup
                    const kioskEvent = new CustomEvent('enable-kiosk-mode', {
                      detail: { reason: 'session-ended', force: true }
                    });
                    window.dispatchEvent(kioskEvent);
                    console.log("Dispatched enable-kiosk-mode event");

                    // As a final fallback, try to reload the page after a short delay
                    setTimeout(() => {
                      try {
                        console.log("Reloading page as final fallback for kiosk mode");
                        window.location.reload();
                      } catch (reloadError) {
                        console.error("Error reloading page:", reloadError);
                      }
                    }, 1000); // Wait 1 second before reload
                  } catch (kioskError) {
                    console.error("Error in kiosk mode enabling process:", kioskError);
                  }

                  console.log("Auto logout triggered after session end");
                } catch (logoutError) {
                  console.error("Error during auto logout:", logoutError);
                }
              }, 5000); // Wait 5 seconds before logout
            }

            // Only close the session in the database if it's gone into yesterday
            if (diffMs <= 0 && isYesterday) {
              // Session has ended and gone into yesterday
              console.log("Session has ended (out_time has passed and gone into yesterday)");

              if (existingSession.status !== "Closed") {
                // Update session status to Closed
                try {
                  // Get device ID from localStorage
                  let deviceId = existingSession.device || null;

                  // Calculate session cost and payment details
                  const cost = sessionCost || existingSession.session_total || 0;
                  const discountAmount = 0;
                  const discountRate = 0;

                  // Update session with closed status and payment details
                  await update(existingSession.id, {
                    status: 'Closed',
                    amount_paid: cost,
                    discount_amount: discountAmount,
                    discount_rate: discountRate
                  });

                  // Create a session log entry for closing
                  await pbclient.collection('session_logs').create({
                    session_id: existingSession.id,
                    type: 'Closed',
                    session_amount: cost
                  });

                  // Update device status to Available
                  if (deviceId) {
                    try {
                      await pbclient.collection('devices').update(deviceId, {
                        status: 'Available',
                        token: '',
                        client_record: ''
                      });
                      console.log("Device status updated to Available");
                    } catch (deviceUpdateError) {
                      console.error("Error updating device status:", deviceUpdateError);
                    }
                  }

                  console.log("Updated session status to Closed");
                } catch (updateError) {
                  console.error("Error updating session status:", updateError);
                }
              }

              // This section is now handled by the code above that checks if diffMs <= 0
              // No need for duplicate notification and logout code here
            } else if (diffMinutes <= 5) {
              // Less than 5 minutes remaining
              console.log(`Session ending soon: ${diffMinutes} minutes remaining`);

              // Show 5-minute warning if not already shown
              if (!notificationShown) {
                showNotification(`Your session will end in ${diffMinutes} minutes. Please save your work.`, true); // Use system notification
                setNotificationShown(true);
              }
            } else {
              // Session is active with more than 5 minutes remaining
              console.log(`Session active: ${diffMinutes} minutes remaining`);

              // If session status is not Active, update it
              if (existingSession.status !== "Active" &&
                existingSession.status !== "Booked" &&
                existingSession.status !== "Extended") {
                try {
                  await update(existingSession.id, { status: "Active" });
                  console.log("Updated session status to Active");
                } catch (updateError) {
                  console.error("Error updating session status:", updateError);
                }
              }
            }
          } else {
            console.log("Session has no out_time, cannot determine remaining time");
          }
        } else {
          // No existing session found, check if we should create a new one
          if (userId) {
            console.log("No session found, creating new session for user:", userId);
            const newSession = await createSession();

            if (newSession) {
              console.log("New session created:", newSession);

              // Show notification that session has started
              showNotification('Your 1-hour session has started.');
            } else {
              console.error("Failed to create new session");
              setError("Failed to create session");
            }
          } else {
            console.log("No user ID provided and no existing session found");
          }
        }
      } catch (error) {
        console.error("Error initializing session:", error);
        setError("Failed to initialize session: " + (error.message || "Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, [userId, activeSession, sessionDataProp, checkExistingSession, createSession, showNotification, notificationShown, update, fetchDeviceGroupAndCalculateCost, checkDeviceTokenAndRecord]);

  // Update session data when real-time updates are received
  useEffect(() => {
    if (sessionData && sessionData.length > 0) {
      const session = sessionData[0];
      setInTime(new Date(session.in_time));
      setOutTime(new Date(session.out_time));
      setIsSessionActive(session.status === 'Active');

      // Update device info if available
      if (session.device && !deviceInfo) {
        pbclient.collection('devices').getOne(session.device)
          .then(device => setDeviceInfo(device))
          .catch(err => console.error('Error fetching device info:', err));
      }
    }
  }, [sessionData, deviceInfo]);

  // Update session data when sessionDataProp changes
  useEffect(() => {
    if (sessionDataProp) {
      // Update session info from props
      if (sessionDataProp.in_time) {
        setInTime(new Date(sessionDataProp.in_time));
      }
      if (sessionDataProp.out_time) {
        setOutTime(new Date(sessionDataProp.out_time));
      }
      setIsSessionActive(activeSession);

      // Update device info if available
      if (sessionDataProp.device && !deviceInfo) {
        pbclient.collection('devices').getOne(sessionDataProp.device)
          .then(device => setDeviceInfo(device))
          .catch(err => console.error('Error fetching device info:', err));
      }
    }
  }, [sessionDataProp, activeSession, deviceInfo]);

  // Update remaining time every second
  useEffect(() => {
    if (isSessionActive) {
      updateRemainingTime();
      const timer = setInterval(updateRemainingTime, 1000);

      return () => clearInterval(timer);
    }
  }, [isSessionActive, updateRemainingTime]);

  // Function to extend the session
  const extendSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);

      // Extend by 1 hour
      const currentOutTime = new Date(outTime);
      const newOutTime = new Date(currentOutTime.getTime() + 60 * 60 * 1000);
      const inTimeDate = new Date(inTime);

      // Calculate new duration in hours
      const newDurationHours = (newOutTime - inTimeDate) / (1000 * 60 * 60);
      const newDurationMinutes = newDurationHours * 60;

      console.log(`Extending session to ${newDurationHours.toFixed(2)} hours (${newDurationMinutes.toFixed(0)} minutes)`);

      // Recalculate session cost if device has a group
      let newCost = sessionCost;
      let discountAmount = 0;
      let discountRate = 0;

      if (deviceInfo && deviceInfo.id) {
        try {
          // Calculate new cost based on extended duration with happy hour pricing
          const costDetails = await fetchDeviceGroupAndCalculateCost(deviceInfo.id, newDurationHours);

          // Update cost and discount information
          newCost = costDetails.finalCost || 0;
          discountAmount = costDetails.discountAmount || 0;
          discountRate = costDetails.discountRate || 0;

          if (costDetails.happyHourApplied) {
            console.log(`Happy hour pricing applied to extended session: ₹${newCost} (Discount: ₹${discountAmount} at ${discountRate}%)`);
          }
        } catch (costError) {
          console.error("Error recalculating session cost:", costError);
        }
      }

      // Update the session
      await update(sessionId, {
        out_time: newOutTime.toISOString(),
        status: 'Extended',
        duration: newDurationMinutes, // Duration in minutes
        session_total: newCost || 0,
        total_amount: newCost || 0,
        discount_amount: discountAmount || 0,
        discount_rate: discountRate || 0
      });

      // Create a session log entry for extension
      await pbclient.collection('session_logs').create({
        session_id: sessionId,
        type: 'Extended',
        session_amount: 0
      });

      setOutTime(newOutTime);
      setIsSessionActive(true);

      console.log('Session extended to:', newOutTime);
    } catch (err) {
      console.error('Error extending session:', err);
      setError('Failed to extend session');
    } finally {
      setLoading(false);
    }
  }, [sessionId, outTime, inTime, deviceInfo, sessionCost, fetchDeviceGroupAndCalculateCost, update]);

  // Format time for display
  const formatTime = (time) => {
    // Make sure time is a number
    const timeValue = typeof time === 'number' ? time : 0;
    return timeValue.toString().padStart(2, '0');
  };



  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Session Information {sessionId}</CardTitle>
        <CardDescription>Your current session details</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4">Loading session information...</div>
        ) : error ? (
          <div className="text-destructive py-4">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Session Status:</Label>
              <span className={isSessionActive ? "text-green-500" : "text-destructive"}>
                {isSessionActive ? "Active" : "Inactive"}
              </span>
            </div>

            {deviceInfo && (
              <div className="flex justify-between items-center">
                <Label>Device:</Label>
                <span>{deviceInfo.name || 'Unknown Device'}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <Label>Start Time:</Label>
              <span>{inTime ? inTime.toLocaleTimeString() : 'N/A'}</span>
            </div>

            <div className="flex justify-between items-center">
              <Label>End Time:</Label>
              <span>{outTime ? outTime.toLocaleTimeString() : 'N/A'}</span>
            </div>

            <div className="flex justify-between items-center">
              <Label>Remaining Time:</Label>
              <span className="text-xl font-bold">
                {formatTime(remainingTime.hours)}:{formatTime(remainingTime.minutes)}:{formatTime(remainingTime.seconds)}
              </span>
            </div>

            <div className="mt-4 p-4 rounded-md shadow-sm shadow-background">
              <div className="flex justify-between items-center">
                <Label className="text-lg font-bold text-green-600">Session Cost:</Label>
                <span className="text-2xl font-bold text-green-600">
                  ₹{sessionCost.toFixed(2)}
                </span>
              </div>

              <div className="mt-2 text-sm text-foreground">
                {groupInfo && inTime && outTime && (
                  <div className="flex flex-col space-y-1">
                    <div className="flex justify-between">
                      <span>Hourly Rate:</span>
                      <span className="font-medium">₹{parseFloat(groupInfo.price).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span className="font-medium">
                        {((new Date(outTime) - new Date(inTime)) / (1000 * 60 * 60)).toFixed(2)} hours
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          onClick={extendSession}
          disabled={loading || !isSessionActive}
        >
          Extend Session
        </Button>
      </CardFooter>
    </Card>
  );
}

export default SessionManager;
