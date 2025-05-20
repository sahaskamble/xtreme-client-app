import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useCollection } from '@/hooks/useCollection';
import { pbclient } from '@/lib/pocketbase/pb';

function Login({ onLogin, isKioskMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Use the users collection
  const {
    loading,
    error: authError,
    authWithPassword
  } = useCollection('clients');

  // Use the devices collection
  const { update: updateDevice } = useCollection('devices');

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Simple validation
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      // Authenticate with PocketBase
      const username = email;
      const authData = await authWithPassword(username, password);

      if (authData) {
        // Successfully authenticated
        const user = authData.record;

        // Make sure we have a username to display
        if (!user.username && user.email) {
          user.username = user.email.split('@')[0]; // Use part of email as username if not set
        } else if (!user.username) {
          user.username = "User"; // Fallback username
        }

        console.log("Authenticated user:", user);

        // Get the auth token
        const token = pbclient.authStore.token;

        try {
          // Find an available device to update
          const devices = await pbclient.collection('devices').getList(1, 1, {
            filter: 'status = "Available"'
          });

          if (devices && devices.items && devices.items.length > 0) {
            const device = devices.items[0];
            console.log("Found device to update:", device);

            // Update the device with token and client_record
            await updateDevice(device.id, {
              token: token,
              client_record: user.id,
              status: "In-Use"
            });

            console.log("Updated device with token and client_record");

            // Store device ID in user object for session creation
            user.deviceId = device.id;

            // Set flag in localStorage to indicate this is a client app login
            localStorage.setItem('client_app_login', 'true');
            console.log("Set client_app_login flag in localStorage");
          } else {
            console.error("No available devices found to update");
          }
        } catch (deviceError) {
          console.error("Error updating device:", deviceError);
          // Continue with login even if device update fails
        }

        // Call the onLogin callback with the user data
        onLogin(user);
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } catch (err) {
      setError('Authentication failed: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {isKioskMode && (
        <div className="bg-primary text-primary-foreground px-4 py-2 rounded-md mb-4">
          Kiosk Mode Active - Login to exit
        </div>
      )}

      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="text-muted-foreground">Please login to continue</p>
      </div>

      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Enter your credentials to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">User name</Label>
              <Input
                id="username"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
            {(error || authError) && (
              <p className="text-destructive text-sm">
                {error || (authError && authError.message)}
              </p>
            )}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default Login;
