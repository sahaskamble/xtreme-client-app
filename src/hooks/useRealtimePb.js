import { useState, useEffect, useCallback, useRef } from 'react';
import { pbclient } from '@/lib/pocketbase/pb';

export function useRealtimePb(collectionName, filter = '') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Use a ref to store the unsubscribe function
  const unsubscribeRef = useRef(null);

  pbclient.autoCancellation(false);

  // Function to fetch initial data
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await pbclient.collection(collectionName).getFullList({
        filter,
        sort: '-created',
      });
      setData(records);
      setError(null);
    } catch (err) {
      console.error(`Error fetching initial ${collectionName} data:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [collectionName, filter]);

  // Function to subscribe to real-time updates
  const subscribe = useCallback(async () => {
    // If we have an existing unsubscribe function, call it
    if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      // Subscribe to collection changes - this returns a Promise that resolves to an unsubscribe function
      const unsubscribeFunc = await pbclient.collection(collectionName).subscribe('*', function(e) {
        const { action, record } = e;

        setData(prevData => {
          // Handle different types of events
          switch (action) {
            case 'create':
              // Add new record to the list
              return [record, ...prevData];

            case 'update':
              // Update existing record
              return prevData.map(item =>
                item.id === record.id ? record : item
              );

            case 'delete':
              // Remove deleted record
              return prevData.filter(item => item.id !== record.id);

            default:
              return prevData;
          }
        });
      });

      // Store the unsubscribe function (not the Promise)
      unsubscribeRef.current = unsubscribeFunc;
      setIsSubscribed(true);
      setError(null);
    } catch (err) {
      console.error(`Error subscribing to ${collectionName}:`, err);
      setError(err);
      setIsSubscribed(false);
    }
  }, [collectionName]);

  // Function to unsubscribe from real-time updates
  const unsubscribe = useCallback(() => {
    if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  // Function to refresh data manually
  const refresh = useCallback(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Set up subscription on mount and clean up on unmount
  useEffect(() => {
    // Create an async function to handle the subscription
    const setupSubscription = async () => {
      // Fetch initial data
      await fetchInitialData();

      // Subscribe to real-time updates
      await subscribe();
    };

    // Call the async function
    setupSubscription().catch(err => {
      console.error('Error setting up subscription:', err);
      setError(err);
    });

    // Clean up on unmount
    return () => {
      unsubscribe();
    };
  }, [collectionName, filter, fetchInitialData, subscribe, unsubscribe]);

  return {
    data,
    loading,
    error,
    isSubscribed,
    refresh,
    subscribe,
    unsubscribe
  };
}
