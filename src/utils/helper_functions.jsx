/**
 * Helper functions for various tasks
 */

// Check localStorage for saved login info
export const getSavedLoginInfo = () => {
	try {
		const savedInfo = localStorage.getItem('user_login_info');
		if (savedInfo) {
			return JSON.parse(savedInfo);
		}
	} catch (error) {
		console.error('Error parsing saved login info:', error);
	}
	return null;
};


