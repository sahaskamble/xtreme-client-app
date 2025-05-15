import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useCollection } from '@/hooks/useCollection';
import { window as neuWindow } from '@neutralinojs/lib';

/**
 * Component for admin to login a client remotely
 */
function ClientLogin() {
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Function to open the client login window
  const openClientLoginWindow = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      // Validate client ID
      if (!clientId.trim()) {
        setError('Please enter a client ID');
        setLoading(false);
        return;
      }
      
      // Create a new window for client login
      const result = await neuWindow.create('resources/client-login.html', {
        title: 'Login Client',
        width: 500,
        height: 600,
        center: true,
        resizable: false,
        alwaysOnTop: true,
        enableInspector: false
      });
      
      console.log('Client login window created with PID:', result.pid);
      
      // Pass the client ID to the new window
      // We'll use localStorage for communication between windows
      localStorage.setItem('admin_client_login_id', clientId);
      
      // Listen for messages from the client login window
      window.addEventListener('storage', handleStorageEvent);
      
    } catch (error) {
      console.error('Error opening client login window:', error);
      setError('Failed to open client login window: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle storage events (for communication between windows)
  const handleStorageEvent = (event) => {
    if (event.key === 'client_login_result') {
      const result = JSON.parse(event.newValue);
      
      if (result.success) {
        setSuccess(true);
        setError('');
        console.log('Client login successful:', result.data);
      } else {
        setError(result.error || 'Login failed');
        setSuccess(false);
      }
      
      // Clean up
      localStorage.removeItem('client_login_result');
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
  
  return (
    <Card className="w-[400px]">
      <CardHeader>
        <CardTitle>Remote Client Login</CardTitle>
        <CardDescription>Login a client from the admin panel</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Enter client ID"
            />
          </div>
          
          {error && <p className="text-destructive text-sm">{error}</p>}
          {success && <p className="text-green-500 text-sm">Client login successful!</p>}
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={openClientLoginWindow} 
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Opening...' : 'Login Client'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default ClientLogin;
