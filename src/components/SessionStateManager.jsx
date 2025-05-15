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
  pbclient.autoCancellation(false);

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
            setSessionActive(false);
            setSessionData(null);
            
            // Close the session if it's not already closed
            if (session.status !== "Closed") {
              try {
                await pbclient.collection('sessions').update(session.id, {
                  status: "Closed"
                });
                console.log("Updated expired session status to Closed");
              } catch (updateError) {
                console.error("Error updating session status:", updateError);
              }
            }
            
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
