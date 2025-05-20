import { useState, useCallback, useEffect } from 'react';
import { pbclient } from '@/lib/pocketbase/pb';

/**
 * Hook for interacting with a PocketBase collection
 * @param {string} collectionName - The name of the collection to interact with
 * @returns {Object} - Collection operations and state
 */
export function useCollection(collectionName) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Reset error when collection name changes
  useEffect(() => {
    setError(null);
  }, [collectionName]);

  /**
   * Get a list of records from the collection
   * @param {Object} options - Query options
   * @param {number} options.page - Page number (default: 1)
   * @param {number} options.perPage - Items per page (default: 50)
   * @param {string} options.sort - Sort field (default: '-created')
   * @param {string} options.filter - Filter query
   * @param {string} options.expand - Expand relations
   * @returns {Promise<Array>} - List of records
   */
  const getList = useCallback(async (options = {}) => {
    const {
      page = 1,
      perPage = 50,
      sort = '-created',
      filter = '',
      expand = '',
    } = options;

    setLoading(true);
    setError(null);

    try {
      const result = await pbclient.collection(collectionName).getList(
        page,
        perPage,
        {
          sort,
          filter,
          expand,
        }
      );

      setData(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);

      return result.items;
    } catch (err) {
      console.error(`Error fetching ${collectionName} list:`, err);
      setError(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  /**
   * Get a single record by ID
   * @param {string} id - Record ID
   * @param {Object} options - Query options
   * @param {string} options.expand - Expand relations
   * @returns {Promise<Object|null>} - Record data or null
   */
  const getOne = useCallback(async (id, options = {}) => {
    const { expand = '' } = options;

    setLoading(true);
    setError(null);

    try {
      const record = await pbclient.collection(collectionName).getOne(id, { expand });
      setData(record);
      return record;
    } catch (err) {
      console.error(`Error fetching ${collectionName} record:`, err);
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @param {Object} options - Create options
   * @param {string} options.expand - Expand relations
   * @returns {Promise<Object|null>} - Created record or null
   */
  const create = useCallback(async (recordData, options = {}) => {
    const { expand = '' } = options;

    setLoading(true);
    setError(null);

    try {
      const record = await pbclient.collection(collectionName).create(recordData, { expand });
      return record;
    } catch (err) {
      console.error(`Error creating ${collectionName} record:`, err);
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  /**
   * Update an existing record
   * @param {string} id - Record ID
   * @param {Object} data - Record data
   * @param {Object} options - Update options
   * @param {string} options.expand - Expand relations
   * @returns {Promise<Object|null>} - Updated record or null
   */
  const update = useCallback(async (id, recordData, options = {}) => {
    const { expand = '' } = options;

    setLoading(true);
    setError(null);

    try {
      const record = await pbclient.collection(collectionName).update(id, recordData, { expand });
      return record;
    } catch (err) {
      console.error(`Error updating ${collectionName} record:`, err);
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  /**
   * Delete a record
   * @param {string} id - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  const remove = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      await pbclient.collection(collectionName).delete(id);
      return true;
    } catch (err) {
      console.error(`Error deleting ${collectionName} record:`, err);
      setError(err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  /**
   * Authenticate a clients with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object|null>} - User record or null
   */
  const authWithPassword = useCallback(async (username, password) => {

    setLoading(true);
    setError(null);

    try {
      const authData = await pbclient.collection('clients').authWithPassword(username, password);
      return authData;
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  /**
   * Check if a user is authenticated
   * @returns {boolean} - Authentication status
   */
  const isAuthenticated = useCallback(() => {
    return pbclient.authStore.isValid;
  }, []);

  /**
   * Get the current authenticated user
   * @returns {Object|null} - User record or null
   */
  const getAuthUser = useCallback(() => {
    return pbclient.authStore.record;
  }, []);

  /**
   * Logout the current user
   */
  const logout = useCallback(() => {
    pbclient.authStore.clear();
  }, []);

  return {
    // State
    loading,
    error,
    data,
    totalItems,
    totalPages,

    // CRUD operations
    getList,
    getOne,
    create,
    update,
    remove,

    // Auth operations (only for users collection)
    authWithPassword,
    isAuthenticated,
    getAuthUser,
    logout,
  };
}
