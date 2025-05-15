import { useState, useEffect, useCallback } from 'react';
import { pbclient } from '@/lib/pocketbase/pb';

/**
 * Component to monitor device token and handle auto-login
 * This component doesn't render anything, it just monitors device token
 */
const DeviceTokenMonitor = ({ deviceId, onAutoLogin }) => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastCheckedToken, setLastCheckedToken] = useState('');
  const [checkInterval, setCheckInterval] = useState(null);

  // Function to check for device token and auto-login
  const checkDeviceTokenAndLogin = useCallback(async () => {
    if (!deviceId) {
      console.log("No device ID provided, cannot check for token");
      return false;
    }

    try {
      console.log("Checking for device token:", deviceId);

      // Get the device details
      const device = await pbclient.collection('devices').getOne(deviceId);

      // If device has a token and it's different from the last checked token
      if (device && device.token && device.token !== lastCheckedToken) {
        console.log("Found new token for device:", deviceId);
        setLastCheckedToken(device.token);

        console.log("Attempting auto-login with device token");
        console.log("Device token:", device.token);
        console.log("Device client_record:", device.client_record);

        let clientRecord = null;

        // Try to parse client_record if it exists
        if (device.client_record && device.client_record.trim() !== '') {
          try {
            clientRecord = JSON.parse(device.client_record);
            console.log("Parsed client record:", clientRecord);
          } catch (parseError) {
            console.error("Error parsing client record:", parseError);
            console.log("Raw client_record:", device.client_record);
          }
        }

        // Try to authenticate with the token
        try {
          console.log("Attempting to save token to auth store");
          console.log("Token length:", device.token ? device.token.length : 0);

          // Check if the token is valid before trying to save it
          const isTokenValid = pbclient.validateToken(device.token);
          console.log("Token validation result:", isTokenValid);

          if (!isTokenValid) {
            console.error("Token is invalid (expired or malformed)");
            return false;
          }

          // Try direct authentication with the token
          pbclient.authStore.save(device.token, clientRecord);

          console.log("Auth store after save:", {
            isValid: pbclient.authStore.isValid,
            token: pbclient.authStore.token ? "Present (length: " + pbclient.authStore.token.length + ")" : "Not present"
          });

          // Check if the token is valid
          if (pbclient.authStore.isValid) {
            console.log("Token is valid according to authStore.isValid");

            if (!pbclient.authStore.token) {
              console.error("Token is missing from auth store after save");
              return false;
            }

            const tokenParts = pbclient.authStore.token.split('.');
            console.log("Token parts count:", tokenParts.length);

            if (tokenParts.length !== 3) {
              console.error("Token does not have 3 parts as expected for JWT");
              return false;
            }

            const base64Url = tokenParts[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            console.log("Base64 payload:", base64);

            try {
              const tokenData = JSON.parse(atob(base64));
              console.log("Token data:", tokenData);

              // Try different fields that might contain the user ID
              const userId = tokenData.id || tokenData.sub || tokenData.user_id || tokenData.userId;

              if (!userId) {
                console.error("No user ID found in token");
                return false;
              }

              console.log("User ID from token:", userId);

              // Get the user data - try different collections
              let authUser = null;
              try {
                // Try clients collection first
                authUser = await pbclient.collection('clients').getOne(userId);
                console.log("Found user in clients collection:", authUser);
              } catch (clientError) {
                console.log("User not found in clients collection, trying users collection");
                try {
                  // Try users collection as fallback
                  authUser = await pbclient.collection('users').getOne(userId);
                  console.log("Found user in users collection:", authUser);
                } catch (userError) {
                  console.error("User not found in any collection");
                  return false;
                }
              }

              if (authUser) {
                console.log("Auto-login successful:", authUser);

                // Make sure we have a username to display
                let displayUsername = authUser.username;
                if (!displayUsername && authUser.email) {
                  displayUsername = authUser.email.split('@')[0];
                } else if (!displayUsername) {
                  displayUsername = "User";
                }

                // Notify parent component
                if (onAutoLogin) {
                  onAutoLogin({
                    userId: authUser.id,
                    username: displayUsername,
                    deviceId: deviceId
                  });
                }

                return true;
              }
            } catch (tokenError) {
              console.error("Error processing token or getting user data:", tokenError);
            }
          } else {
            console.error("Token is invalid according to authStore.isValid");

            // Try a different approach - try to extract user ID from token directly
            try {
              console.log("Attempting to extract user ID from token directly");

              if (!device.token) {
                console.error("No token available");
                return false;
              }

              // Try to decode the token manually
              const tokenParts = device.token.split('.');
              if (tokenParts.length !== 3) {
                console.error("Token does not have 3 parts as expected for JWT");
                return false;
              }

              const base64Url = tokenParts[1];
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

              try {
                const tokenData = JSON.parse(atob(base64));
                console.log("Token data extracted manually:", tokenData);

                // Try to find user ID in token
                const userId = tokenData.id || tokenData.sub || tokenData.user_id || tokenData.userId;

                if (!userId) {
                  console.error("No user ID found in token");
                  return false;
                }

                console.log("User ID extracted from token:", userId);

                // Try to get user data directly
                try {
                  // Try clients collection first
                  const authUser = await pbclient.collection('clients').getOne(userId);
                  console.log("Found user in clients collection:", authUser);

                  // Make sure we have a username to display
                  let displayUsername = authUser.username;
                  if (!displayUsername && authUser.email) {
                    displayUsername = authUser.email.split('@')[0];
                  } else if (!displayUsername) {
                    displayUsername = "User";
                  }

                  // Try to manually set the auth store
                  try {
                    pbclient.authStore.save(device.token, authUser);
                    console.log("Manually set auth store with token and user data");
                  } catch (authStoreError) {
                    console.error("Error setting auth store manually:", authStoreError);
                  }

                  // Notify parent component
                  if (onAutoLogin) {
                    onAutoLogin({
                      userId: authUser.id,
                      username: displayUsername,
                      deviceId: deviceId
                    });
                  }

                  return true;
                } catch (userError) {
                  console.error("Error getting user data:", userError);
                }
              } catch (decodeError) {
                console.error("Error decoding token payload:", decodeError);
              }
            } catch (extractError) {
              console.error("Error extracting user ID from token:", extractError);
            }
          }
        } catch (authError) {
          console.error("Error during authentication:", authError);
          // Clear the invalid auth data
          pbclient.authStore.clear();
        }
      } else if (device && !device.token && lastCheckedToken) {
        // If device had a token before but now it's gone, reset the last checked token
        console.log("Device token has been removed");
        setLastCheckedToken('');
      }
    } catch (error) {
      console.error("Error checking for device token:", error);
    }

    return false;
  }, [deviceId, lastCheckedToken, onAutoLogin]);

  // Set up real-time subscription to device updates
  useEffect(() => {
    if (deviceId && !isMonitoring) {
      setIsMonitoring(true);

      console.log("Setting up device token monitor for device:", deviceId);

      let unsubscribeFunc = null;

      try {
        // Subscribe to device updates - handle the promise properly
        pbclient.collection('devices').subscribe(deviceId, async (data) => {
          console.log("Device updated:", data);

          // Check if the device has a token
          if (data.record && data.record.token && data.record.token !== lastCheckedToken) {
            console.log("Device token updated, attempting auto-login");
            await checkDeviceTokenAndLogin();
          }
        }).then(unsubscribe => {
          unsubscribeFunc = unsubscribe;
          console.log("Successfully subscribed to device updates");
        }).catch(error => {
          console.error("Error subscribing to device updates:", error);
        });
      } catch (error) {
        console.error("Error setting up subscription:", error);
      }

      // Initial check for device token
      checkDeviceTokenAndLogin();

      // Set up interval to check for device token every 30 seconds
      const interval = setInterval(() => {
        checkDeviceTokenAndLogin();
      }, 30000);

      setCheckInterval(interval);

      return () => {
        // Clean up subscription and interval
        if (typeof unsubscribeFunc === 'function') {
          try {
            unsubscribeFunc();
            console.log("Unsubscribed from device updates");
          } catch (error) {
            console.error("Error unsubscribing from device updates:", error);
          }
        }

        if (interval) {
          clearInterval(interval);
          console.log("Cleared check interval");
        }

        setIsMonitoring(false);
      };
    }
  }, [deviceId, checkDeviceTokenAndLogin, lastCheckedToken]);

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

export default DeviceTokenMonitor;
