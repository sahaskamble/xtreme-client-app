import { useState, useEffect } from 'react';
import { pbclient } from '@/lib/pocketbase/pb';

/**
 * Component to manage session state and kiosk mode
 * This component doesn't render anything, it just manages state
 */
const SessionStateManager = ({ deviceId, onSessionStateChange }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [checkInterval, setCheckInterval] = useState(null);
  const [isClientApp, setIsClientApp] = useState(false);
  pbclient.autoCancellation(false);

  // Check if this is a client app login
  useEffect(() => {
    // Check if there's a flag in localStorage indicating this is a client app login
    const clientAppLogin = localStorage.getItem('client_app_login');
    if (clientAppLogin) {
      console.log("Client app login detected");
      setIsClientApp(true);
    }
  }, []);

  // Function to check for active sessions
  const checkForActiveSessions = async () => {
    if (!deviceId) {
      console.log("No device ID provided, cannot check for sessions");
      setIsChecking(false);
      return;
    }

    try {
      console.log("Checking for active sessions for device:", deviceId);

      // Check for any active session for this device
      const sessions = await pbclient.collection('sessions').getList(1, 1, {
        filter: `device = "${deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`,
        sort: '-created'
      });

      console.log("Session query filter:", `device = "${deviceId}" && (status = "Booked" || status = "Active" || status = "Occupied" || status = "Extended")`);

      if (sessions && sessions.items.length > 0) {
        const session = sessions.items[0];
        console.log("Found active session:", session);

        // Check if session is still valid (out_time hasn't passed)
        if (session.out_time) {
          const outTime = new Date(session.out_time);
          const now = new Date();

          if (now < outTime) {
            console.log("Session is still valid, out_time:", outTime);
            setSessionActive(true);
            setSessionData(session);

            // If session is not already Active, update it
            if (session.status !== "Active") {
              try {
                await pbclient.collection('sessions').update(session.id, {
                  status: "Active"
                });
                console.log("Updated session status to Active");
              } catch (updateError) {
                console.error("Error updating session status:", updateError);
              }
            }

            // Notify parent component
            if (onSessionStateChange) {
              onSessionStateChange(true, session);
            }

            return true;
          } else {
            console.log("Session has expired, out_time:", outTime);

            // If this is a client app login, close the session and return to login
            if (isClientApp) {
              console.log("Client app login detected with expired session");

              // Close the session if it's not already closed
              if (session.status !== "Closed") {
                try {
                  await pbclient.collection('sessions').update(session.id, {
                    status: "Closed"
                  });
                  console.log("Updated expired session status to Closed");

                  // Clear auth store to log out
                  pbclient.authStore.clear();

                  // Clear localStorage
                  localStorage.removeItem('user_login_info');
                  localStorage.removeItem('client_app_login');

                  // Dispatch event to enable kiosk mode
                  const kioskEvent = new CustomEvent('enable-kiosk-mode', {
                    detail: { reason: 'client-session-expired', force: true }
                  });
                  window.dispatchEvent(kioskEvent);

                  // Reload page to return to login
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                } catch (updateError) {
                  console.error("Error updating session status:", updateError);
                }
              }
            }

            setSessionActive(false);
            setSessionData(null);

            // Notify parent component
            if (onSessionStateChange) {
              onSessionStateChange(false, null);
            }

            return false;
          }
        } else {
          console.log("Session has no out_time, treating as active");
          setSessionActive(true);
          setSessionData(session);

          // Notify parent component
          if (onSessionStateChange) {
            onSessionStateChange(true, session);
          }

          return true;
        }
      } else {
        console.log("No active sessions found for device");

        // If this is a client app login, create a new session
        if (isClientApp) {
          console.log("Client app login detected with no active session - a new session will be created by SessionManager");
        }

        setSessionActive(false);
        setSessionData(null);

        // Notify parent component
        if (onSessionStateChange) {
          onSessionStateChange(false, null);
        }

        return false;
      }
    } catch (error) {
      console.error("Error checking for active sessions:", error);
      setSessionActive(false);
      setSessionData(null);

      // Notify parent component
      if (onSessionStateChange) {
        onSessionStateChange(false, null);
      }

      return false;
    } finally {
      setIsChecking(false);
    }
  };

  // Check for active sessions on mount and when deviceId changes
  useEffect(() => {
    if (deviceId) {
      setIsChecking(true);
      checkForActiveSessions();

      // Set up interval to check for active sessions every 30 seconds
      const interval = setInterval(() => {
        checkForActiveSessions();
      }, 30000);

      setCheckInterval(interval);

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    }
  }, [deviceId]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [checkInterval]);

  // This component doesn't render anything
  return null;
};

export default SessionStateManager;
