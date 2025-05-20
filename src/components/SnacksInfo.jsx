import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useRealtimePb } from '@/hooks/useRealtimePb';
import { useCollection } from '@/hooks/useCollection';

/**
 * Component for displaying available snacks information
 */
function SnacksInfo() {
  const [snacks, setSnacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use the collection hook to fetch snacks data
  const { getList } = useCollection('snacks');

  // Fetch snacks data on component mount
  useEffect(() => {
    const fetchSnacks = async () => {
      setLoading(true);
      try {
        // Fetch snacks from snacks collection
        const snacksItems = await getList(
          1,
          50,
          '-created',
          'status = "Available" && quantity > 0'
        );

        if (snacksItems && snacksItems.length > 0) {
          setSnacks(snacksItems);
        } else {
          setSnacks([]);
        }
        setError(null);
      } catch (err) {
        console.error('Error fetching snacks:', err);
        setError('Failed to load snacks information');
        setSnacks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSnacks();
  }, [getList]);

  // Group snacks by type (Eatable, Drinkable)
  const groupedSnacks = snacks.reduce((groups, snack) => {
    const type = snack.type || 'Other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(snack);
    return groups;
  }, {});

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Available Snacks</CardTitle>
        <CardDescription>Snacks and drinks available for purchase</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4">Loading snacks information...</div>
        ) : error ? (
          <div className="text-destructive py-4">Error loading snacks information</div>
        ) : snacks.length === 0 ? (
          <div className="text-center py-4">No snacks available at the moment</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSnacks).map(([type, items]) => (
              <div key={type} className="space-y-2">
                <h3 className="text-lg font-semibold">{type}</h3>
                <div className="grid grid-cols-1 gap-2">
                  {items.map((snack) => (
                    <div
                      key={snack.id}
                      className="flex justify-between items-center p-2 rounded-md border"
                    >
                      <div>
                        <div className="font-medium">{snack.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {snack.quantity} available
                          {snack.location && <span> • {snack.location}</span>}
                        </div>
                      </div>
                      <div className="font-bold">
                        ₹{snack.selling_price ? snack.selling_price.toFixed(2) : '0.00'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SnacksInfo;
