import { useState, useEffect, useCallback } from 'react';
import { pbclient } from '@/lib/pocketbase/pb';

/**
 * Component to monitor device for screenshot requests and take screenshots
 * This component doesn't render anything, it just monitors for screenshot requests
 */
const ScreenshotMonitor = ({ deviceId }) => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [checkInterval, setCheckInterval] = useState(null);
  const [lastScreenshotTime, setLastScreenshotTime] = useState(0);
  const SCREENSHOT_COOLDOWN = 5000; // 5 seconds cooldown between screenshots

  // Function to take a screenshot using Neutralino API
  const takeScreenshot = useCallback(async () => {
    if (!deviceId) {
      console.log("No device ID provided, cannot take screenshot");
      return false;
    }

    // Check if we're within the cooldown period
    const now = Date.now();
    if (now - lastScreenshotTime < SCREENSHOT_COOLDOWN) {
      console.log("Screenshot cooldown period active, skipping screenshot");
      return false;
    }

    try {
      console.log("Taking screenshot for device:", deviceId);
      
      // Check if Neutralino API is available
      if (typeof window.Neutralino === 'undefined' || !window.Neutralino.os) {
        console.error("Neutralino API not available for taking screenshots");
        return false;
      }

      // Take screenshot using Neutralino API
      const screenshotResult = await window.Neutralino.os.execCommand('gnome-screenshot -f /tmp/xtreme_screenshot.png');
      
      // Check if screenshot was successful
      if (screenshotResult.exitCode !== 0) {
        // Try alternative screenshot methods based on OS
        const os = await window.Neutralino.os.getEnv('OS');
        let alternativeCommand = '';
        
        if (os.includes('Windows')) {
          // Windows screenshot command
          alternativeCommand = 'powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\\"{PRTSC}\\"); Start-Sleep -s 1; $img = [System.Windows.Forms.Clipboard]::GetImage(); $img.Save(\\"C:\\\\temp\\\\xtreme_screenshot.png\\");"';
        } else if (os.includes('Darwin')) {
          // macOS screenshot command
          alternativeCommand = 'screencapture -x /tmp/xtreme_screenshot.png';
        } else {
          // Try other Linux screenshot tools
          alternativeCommand = 'import -window root /tmp/xtreme_screenshot.png || scrot /tmp/xtreme_screenshot.png || xwd -root | convert xwd:- /tmp/xtreme_screenshot.png';
        }
        
        const altResult = await window.Neutralino.os.execCommand(alternativeCommand);
        if (altResult.exitCode !== 0) {
          console.error("Failed to take screenshot with alternative method:", altResult.stderr);
          return false;
        }
      }
      
      // Read the screenshot file
      const screenshotData = await window.Neutralino.filesystem.readBinaryFile('/tmp/xtreme_screenshot.png');
      
      // Convert binary data to base64
      const base64Data = btoa(String.fromCharCode.apply(null, new Uint8Array(screenshotData)));
      
      // Create a File object from the base64 data
      const blob = await fetch(`data:image/png;base64,${base64Data}`).then(res => res.blob());
      const file = new File([blob], 'screenshot.png', { type: 'image/png' });
      
      // Create a FormData object to upload the file
      const formData = new FormData();
      formData.append('screenshot', file);
      formData.append('device', deviceId);
      formData.append('timestamp', new Date().toISOString());
      
      // Upload the screenshot to PocketBase
      const screenshotRecord = await pbclient.collection('screenshots').create(formData);
      console.log("Screenshot uploaded successfully:", screenshotRecord);
      
      // Update the device's take_screenshot field to false
      await pbclient.collection('devices').update(deviceId, {
        take_screenshot: false
      });
      
      console.log("Device take_screenshot field reset to false");
      
      // Update last screenshot time
      setLastScreenshotTime(Date.now());
      
      // Clean up the temporary file
      await window.Neutralino.filesystem.removeFile('/tmp/xtreme_screenshot.png');
      
      return true;
    } catch (error) {
      console.error("Error taking or uploading screenshot:", error);
      
      // Still try to reset the take_screenshot field to false to prevent endless retries
      try {
        await pbclient.collection('devices').update(deviceId, {
          take_screenshot: false
        });
        console.log("Device take_screenshot field reset to false after error");
      } catch (resetError) {
        console.error("Error resetting take_screenshot field:", resetError);
      }
      
      return false;
    }
  }, [deviceId, lastScreenshotTime]);

  // Function to check if a screenshot is requested
  const checkScreenshotRequested = useCallback(async () => {
    if (!deviceId) {
      return;
    }

    try {
      // Get the device details
      const device = await pbclient.collection('devices').getOne(deviceId);
      
      // Check if screenshot is requested
      if (device && device.take_screenshot === true) {
        console.log("Screenshot requested for device:", deviceId);
        await takeScreenshot();
      }
    } catch (error) {
      console.error("Error checking for screenshot request:", error);
    }
  }, [deviceId, takeScreenshot]);

  // Set up real-time subscription to device updates
  useEffect(() => {
    if (deviceId && !isMonitoring) {
      setIsMonitoring(true);

      console.log("Setting up screenshot monitor for device:", deviceId);

      let unsubscribeFunc = null;

      try {
        // Subscribe to device updates
        pbclient.collection('devices').subscribe(deviceId, async (data) => {
          console.log("Device updated, checking for screenshot request:", data);
          
          // Check if screenshot is requested
          if (data.record && data.record.take_screenshot === true) {
            console.log("Screenshot requested via real-time update");
            await takeScreenshot();
          }
        }).then(unsubscribe => {
          unsubscribeFunc = unsubscribe;
          console.log("Successfully subscribed to device updates for screenshots");
        }).catch(error => {
          console.error("Error subscribing to device updates for screenshots:", error);
        });
      } catch (error) {
        console.error("Error setting up screenshot subscription:", error);
      }

      // Initial check for screenshot request
      checkScreenshotRequested();
      
      // Set up interval to check for screenshot requests every 10 seconds
      const interval = setInterval(() => {
        checkScreenshotRequested();
      }, 10000);
      
      setCheckInterval(interval);
      
      return () => {
        // Clean up subscription and interval
        if (typeof unsubscribeFunc === 'function') {
          try {
            unsubscribeFunc();
            console.log("Unsubscribed from device updates for screenshots");
          } catch (error) {
            console.error("Error unsubscribing from device updates for screenshots:", error);
          }
        }
        
        if (interval) {
          clearInterval(interval);
          console.log("Cleared screenshot check interval");
        }
        
        setIsMonitoring(false);
      };
    }
  }, [deviceId, checkScreenshotRequested, takeScreenshot]);

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

export default ScreenshotMonitor;
