import { useState, useEffect, useCallback } from 'react';
import { pbclient } from '@/lib/pocketbase/pb';
import { useRealtimePb } from '@/hooks/useRealtimePb';
import ScreenshotIndicator from './ScreenshotIndicator';
import { computer, filesystem } from '@neutralinojs/lib';

/**
 * Component to monitor device for screenshot requests and take screenshots
 * This component doesn't render anything in production, but shows a visual indicator in development
 */
const ScreenshotMonitor = ({ deviceId }) => {
  const [checkInterval, setCheckInterval] = useState(null);
  const [lastScreenshotTime, setLastScreenshotTime] = useState(0);
  const [isScreenshotting, setIsScreenshotting] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState('');
  const SCREENSHOT_COOLDOWN = 5000; // 5 seconds cooldown between screenshots

  // Use real-time hook to monitor device changes
  const { data: deviceData } = useRealtimePb(
    'devices',
    deviceId ? `id = "${deviceId}"` : ''
  );

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

      // Show screenshot indicator
      setIsScreenshotting(true);
      setScreenshotStatus('Initializing screenshot...');

      // Check if Neutralino API is available
      // if (typeof window.Neutralino === 'undefined' || !window.Neutralino.os) {
      //   console.error("Neutralino API not available for taking screenshots");
      //   setScreenshotStatus('Error: Neutralino API not available');
      //   setTimeout(() => setIsScreenshotting(false), 2000);
      //   return false;
      // }

      // Detect OS
      let os = '';
      try {
        setScreenshotStatus('Detecting operating system...');
        // Try to get OS from Neutralino
        // const osInfo = await window.Neutralino.os.getOSInfo();
        const osInfo = await computer.getOSInfo()
        os = osInfo.name.toLowerCase();
        console.log("Detected OS:", os);
      } catch (osError) {
        console.error("Error detecting OS:", osError);
        setScreenshotStatus('Using fallback OS detection...');
        // Fallback OS detection
        if (navigator.platform.toLowerCase().includes('win')) {
          os = 'windows';
        } else if (navigator.platform.toLowerCase().includes('mac')) {
          os = 'darwin';
        } else {
          os = 'linux';
        }
        console.log("Fallback OS detection:", os);
      }

      // Define temporary file path based on OS
      let tempFilePath = '';
      if (os.includes('windows')) {
        tempFilePath = 'C:\\temp\\xtreme_screenshot.png';
        // Ensure temp directory exists
        try {
          await window.Neutralino.os.execCommand('mkdir C:\\temp 2>nul');
        } catch (mkdirError) {
          console.log("Temp directory may already exist:", mkdirError);
        }
      } else {
        tempFilePath = '/tmp/xtreme_screenshot.png';
      }

      console.log("Using temporary file path:", tempFilePath);

      // Try multiple screenshot methods based on OS
      let screenshotSuccess = false;
      let screenshotError = null;

      setScreenshotStatus(`Preparing to capture screenshot on ${os}...`);

      // Define screenshot commands for each OS
      const commands = {
        windows: [
          // PowerShell method
          `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{PRTSC}'); Start-Sleep -s 1; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $img.Save('${tempFilePath}', [System.Drawing.Imaging.ImageFormat]::Png); }"`,
          // Alternative using nircmd
          `nircmd.exe savescreenshot "${tempFilePath}"`,
          // Alternative using screencapture.exe if available
          `screencapture.exe "${tempFilePath}"`
        ],
        darwin: [
          // macOS screencapture
          `screencapture -x "${tempFilePath}"`,
          // Alternative using screencapture with different options
          `screencapture -x -t png "${tempFilePath}"`
        ],
        linux: [
          // GNOME Screenshot
          `gnome-screenshot -f "${tempFilePath}"`,
          // Scrot
          `scrot "${tempFilePath}"`,
          // Import from ImageMagick
          `import -window root "${tempFilePath}"`,
          // XWD with convert
          `xwd -root | convert xwd:- "${tempFilePath}"`,
          // Spectacle (KDE)
          `spectacle -b -n -o "${tempFilePath}"`,
          // Flameshot
          `flameshot full -p "${tempFilePath}"`,
          // XFCE4 Screenshooter
          `xfce4-screenshooter -f -s "${tempFilePath}"`
        ]
      };

      // Get commands for current OS
      const osCommands = commands[os.includes('windows') ? 'windows' :
        os.includes('darwin') ? 'darwin' : 'linux'];

      // Try each command until one succeeds
      let commandIndex = 0;
      for (const command of osCommands) {
        commandIndex++;
        try {
          setScreenshotStatus(`Trying screenshot method ${commandIndex}/${osCommands.length}...`);
          console.log("Trying screenshot command:", command);
          const result = await window.Neutralino.os.execCommand(command);

          if (result.exitCode === 0) {
            console.log("Screenshot command succeeded:", command);
            setScreenshotStatus(`Screenshot captured successfully with method ${commandIndex}`);
            screenshotSuccess = true;
            break;
          } else {
            console.log("Screenshot command failed:", command, result);
            setScreenshotStatus(`Method ${commandIndex} failed, trying next...`);
            screenshotError = result.stderr || result.stdout || "Unknown error";
          }
        } catch (cmdError) {
          console.log("Error executing screenshot command:", command, cmdError);
          setScreenshotStatus(`Error with method ${commandIndex}, trying next...`);
          screenshotError = cmdError.message || "Unknown error";
        }
      }

      if (!screenshotSuccess) {
        console.error("All screenshot methods failed. Last error:", screenshotError);
        setScreenshotStatus('Error: All screenshot methods failed');
        setTimeout(() => setIsScreenshotting(false), 2000);
        throw new Error("Failed to take screenshot with any available method");
      }

      // Check if file exists
      try {
        setScreenshotStatus('Verifying screenshot file...');
        const stats = await window.Neutralino.filesystem.getStats(tempFilePath);
        console.log("Screenshot file stats:", stats);

        if (!stats || stats.size === 0) {
          setScreenshotStatus('Error: Screenshot file is empty');
          setTimeout(() => setIsScreenshotting(false), 2000);
          throw new Error("Screenshot file is empty or does not exist");
        }
      } catch (statsError) {
        console.error("Error checking screenshot file:", statsError);
        setScreenshotStatus('Error: Screenshot file not accessible');
        setTimeout(() => setIsScreenshotting(false), 2000);
        throw new Error("Screenshot file does not exist or is not accessible");
      }

      // Read the screenshot file
      setScreenshotStatus('Reading screenshot file...');
      console.log("Reading screenshot file:", tempFilePath);
      const screenshotData = await window.Neutralino.filesystem.readBinaryFile(tempFilePath);

      // Convert binary data to base64
      setScreenshotStatus('Processing screenshot data...');
      const base64Data = btoa(String.fromCharCode.apply(null, new Uint8Array(screenshotData)));
      console.log("Converted screenshot to base64, length:", base64Data.length);

      // Create a File object from the base64 data
      const blob = await fetch(`data:image/png;base64,${base64Data}`).then(res => res.blob());
      const file = new File([blob], 'screenshot.png', { type: 'image/png' });

      // Create a FormData object to upload the file
      const formData = new FormData();
      formData.append('screenshot', file);
      formData.append('device', deviceId);
      formData.append('timestamp', new Date().toISOString());

      // Upload the screenshot to PocketBase
      setScreenshotStatus('Uploading screenshot to server...');
      console.log("Uploading screenshot to PocketBase");
      const screenshotRecord = await pbclient.collection('screenshots').create(formData);
      console.log("Screenshot uploaded successfully:", screenshotRecord);

      // Update the device's take_screenshot field to false
      setScreenshotStatus('Resetting screenshot request flag...');
      await pbclient.collection('devices').update(deviceId, {
        take_screenshot: false
      });

      console.log("Device take_screenshot field reset to false");

      // Update last screenshot time
      setLastScreenshotTime(Date.now());

      // Clean up the temporary file
      setScreenshotStatus('Cleaning up temporary files...');
      try {
        await filesystem.removeFile(tempFilePath);
        console.log("Temporary screenshot file removed");
      } catch (removeError) {
        console.error("Error removing temporary screenshot file:", removeError);
      }

      // Show success message
      setScreenshotStatus('Screenshot completed successfully!');
      setTimeout(() => setIsScreenshotting(false), 2000);

      return true;
    } catch (error) {
      console.error("Error taking or uploading screenshot:", error);

      // Show error in the indicator
      setScreenshotStatus(`Error: ${error.message || 'Unknown error'}`);

      // Still try to reset the take_screenshot field to false to prevent endless retries
      try {
        await pbclient.collection('devices').update(deviceId, {
          take_screenshot: false
        });
        console.log("Device take_screenshot field reset to false after error");
      } catch (resetError) {
        console.error("Error resetting take_screenshot field:", resetError);
        setScreenshotStatus('Error: Failed to reset screenshot flag');
      }

      // Hide the indicator after a delay
      setTimeout(() => setIsScreenshotting(false), 3000);

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

  // Monitor device data for screenshot requests
  useEffect(() => {
    if (!deviceId || !deviceData || deviceData.length === 0) {
      return;
    }

    console.log("Device data updated, checking for screenshot request:", deviceData);

    // Get the device from the data array
    const device = deviceData[0];

    // Check if screenshot is requested
    if (device && device.take_screenshot === true) {
      console.log("Screenshot requested via real-time update for device:", deviceId);
      takeScreenshot();
    }
  }, [deviceId, deviceData, takeScreenshot]);

  // Set up a fallback polling mechanism in case real-time updates fail
  useEffect(() => {
    if (!deviceId) {
      return;
    }

    console.log("Setting up fallback screenshot polling for device:", deviceId);

    // Initial check for screenshot request
    checkScreenshotRequested();

    // Set up interval to check for screenshot requests every 30 seconds
    const interval = setInterval(() => {
      checkScreenshotRequested();
    }, 30000); // 30 seconds

    setCheckInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
        console.log("Cleared screenshot check interval");
      }
    };
  }, [deviceId, checkScreenshotRequested]);

  // This component renders the screenshot indicator in development mode
  return (
    <ScreenshotIndicator
      isVisible={isScreenshotting}
      message={screenshotStatus}
    />
  );
};

export default ScreenshotMonitor;
