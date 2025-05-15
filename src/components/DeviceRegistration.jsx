import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pbclient } from '@/lib/pocketbase/pb';
import { Loader2 } from "lucide-react";

const DeviceRegistration = ({ onDeviceRegistered }) => {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [newDevice, setNewDevice] = useState({
    name: '',
    ip_address: '',
    mac_address: '',
    type: 'PC',
    status: 'Available'
  });
  const [showNewDeviceForm, setShowNewDeviceForm] = useState(false);
  const [error, setError] = useState('');

  // Fetch all available devices on component mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true);
        const result = await pbclient.collection('devices').getList(1, 100, {
          sort: 'name'
        });

        setDevices(result.items);
        console.log("Available devices:", result.items);
      } catch (err) {
        console.error("Error fetching devices:", err);
        setError("Failed to fetch available devices. You can still create a new device.");
        // Even if there's an error, we should still allow creating a new device
        setDevices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, []);

  // Function to get device information from the system
  const getDeviceInfo = async () => {
    try {
      // Try to get hostname
      let hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // If running locally, try to get a more meaningful name
        try {
          if (window.Neutralino) {
            const osInfo = await window.Neutralino.os.getEnv();
            hostname = osInfo.COMPUTERNAME || osInfo.HOSTNAME || 'Client-PC';
          } else {
            hostname = 'Client-PC';
          }
        } catch (e) {
          console.error("Error getting hostname:", e);
          hostname = 'Client-PC';
        }
      }

      // Set device name with a timestamp to ensure uniqueness
      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(0, 12);
      const deviceName = `${hostname}-${timestamp}`;

      // Get IP address (this is just the client IP, not the actual machine IP in most cases)
      const ipAddress = window.location.hostname;

      // For MAC address, we can't reliably get it from the browser
      // We'll use a placeholder and let the user edit it
      const macAddress = "00:00:00:00:00:00";

      setNewDevice({
        ...newDevice,
        name: deviceName,
        ip_address: ipAddress,
        mac_address: macAddress
      });
    } catch (error) {
      console.error("Error getting device info:", error);
      // Set default values if we can't get the info
      setNewDevice({
        ...newDevice,
        name: `Client-PC-${Date.now().toString().slice(-6)}`,
        ip_address: '127.0.0.1',
        mac_address: '00:00:00:00:00:00'
      });
    }
  };

  // Handle selecting an existing device
  const handleSelectDevice = async (deviceId) => {
    try {
      setLoading(true);
      const device = devices.find(d => d.id === deviceId);
      setSelectedDevice(device);

      // Store device info in localStorage
      localStorage.setItem('device_info', JSON.stringify({
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type
      }));

      console.log("Device selected and stored in localStorage:", device.name);

      // Notify parent component
      if (onDeviceRegistered) {
        onDeviceRegistered(device.id);
      }
    } catch (err) {
      console.error("Error selecting device:", err);
      setError("Failed to select device");
    } finally {
      setLoading(false);
    }
  };

  // Handle creating a new device
  const handleCreateDevice = async () => {
    try {
      setLoading(true);
      setError(''); // Clear previous errors

      // Validate form
      if (!newDevice.name || !newDevice.ip_address) {
        setError("Device name and IP address are required");
        setLoading(false);
        return;
      }

      // Generate a unique name if needed
      let deviceName = newDevice.name;
      if (!deviceName.includes('-')) {
        // Add a timestamp to ensure uniqueness
        const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(0, 6);
        deviceName = `${deviceName}-${timestamp}`;
      }

      // Create device in PocketBase
      const deviceData = {
        name: deviceName,
        ip_address: newDevice.ip_address || '127.0.0.1',
        mac_address: newDevice.mac_address || '00:00:00:00:00:00',
        type: newDevice.type || 'PC',
        status: 'Available'
      };

      console.log("Creating device with data:", deviceData);

      const createdDevice = await pbclient.collection('devices').create(deviceData);

      console.log("Created new device:", createdDevice);

      // Store device info in localStorage
      localStorage.setItem('device_info', JSON.stringify({
        deviceId: createdDevice.id,
        deviceName: createdDevice.name,
        deviceType: createdDevice.type
      }));

      // Notify parent component
      if (onDeviceRegistered) {
        onDeviceRegistered(createdDevice.id);
      }
    } catch (err) {
      console.error("Error creating device:", err);

      // Provide more specific error messages
      if (err.status === 400) {
        setError("Invalid device data: " + (err.message || "Please check all fields"));
      } else if (err.status === 403) {
        setError("Permission denied: You don't have permission to create devices");
      } else if (err.status === 0 || err.status === 500) {
        setError("Server error: Please check your connection and try again");
      } else {
        setError("Failed to create device: " + (err.message || "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  };

  // Show new device form and get device info
  const showCreateDeviceForm = async () => {
    setShowNewDeviceForm(true);
    await getDeviceInfo();
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Device Registration</CardTitle>
        <CardDescription>
          Select an existing device or create a new one for this client
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : showNewDeviceForm ? (
          <div className="space-y-4">
            {error && (
              <div className="text-destructive p-3 bg-destructive/10 rounded-md mb-4">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Device Name</Label>
              <Input
                id="name"
                value={newDevice.name}
                onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                value={newDevice.ip_address}
                onChange={(e) => setNewDevice({ ...newDevice, ip_address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mac">MAC Address</Label>
              <Input
                id="mac"
                value={newDevice.mac_address}
                onChange={(e) => setNewDevice({ ...newDevice, mac_address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Device Type</Label>
              <Select
                value={newDevice.type}
                onValueChange={(value) => setNewDevice({ ...newDevice, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PC">PC</SelectItem>
                  <SelectItem value="PS">PS</SelectItem>
                  <SelectItem value="SIM">SIM</SelectItem>
                  <SelectItem value="VR">VR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="">
            {error && (
              <div className="text-destructive p-3 bg-destructive/10 rounded-md mb-4">
                {error}
              </div>
            )}

            {devices.length > 0 && (
              <div className="w-full">
                <Label htmlFor="device" className={'py-4'}>Select Existing Device</Label>
                <Select onValueChange={handleSelectDevice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map(device => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name} ({device.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {devices.length > 0 && (
              <div className="text-center py-2">
                <span className="text-sm text-muted-foreground">or</span>
              </div>
            )}

            <Button
              variant={devices.length > 0 ? "outline" : "default"}
              className="w-full"
              onClick={showCreateDeviceForm}
            >
              Create New Device
            </Button>
          </div>
        )}
      </CardContent>
      {showNewDeviceForm && (
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setShowNewDeviceForm(false)}
            disabled={loading}
          >
            Back
          </Button>
          <Button
            onClick={handleCreateDevice}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Device"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default DeviceRegistration;
