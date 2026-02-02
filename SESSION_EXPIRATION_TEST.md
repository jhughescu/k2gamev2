# Session Expiration Handling - Test Guide

## Problem Solved
Previously, when your session expired during deployment testing, you would get stuck on a screen showing a raw JSON object instead of being redirected to the login page. This has been fixed.

## What Changed

### 1. **Client-side Session Expiration Handler** (`public/js/access.js`)
Added a new `secureApiCall()` wrapper function that:
- Intercepts all API responses
- Detects 401/403 status codes (session expired/unauthorized)
- Checks if the error response includes a `loginUrl`
- Automatically redirects to login with a message: "Your session has expired. Redirecting to login..."
- Prevents raw JSON from being displayed

All fetch calls in `access.js` now use this wrapper:
- `login()` - Handles login
- `loadSessions()` - Loads session list
- `loadGameData()` - Loads game data and quiz questions
- `checkAuth()` - Checks authentication status
- `deleteSelectedSessions()` - Deletes selected sessions
- `logout()` - Logs out user

### 2. **Server-side Session Detection** (`controllers/authController.js`)
The middleware already properly detects JSON requests and returns:
```json
{
  "error": "Unauthorized",
  "message": "Authentication required",
  "loginUrl": "/auth/login"
}
```

This ensures the client always gets JSON with a loginUrl when the session expires.

## Testing Locally

### Quick Start
1. Start your server:
   ```bash
   npm start
   ```

2. Navigate to the test page:
   ```
   http://localhost:3000/test/session-expiration
   ```

3. You'll see a comprehensive test interface with multiple testing options.

### Test Methods

#### Method 1: Manual Session Manipulation
Perfect for quick testing:

1. Go to `/facilitator/dashboard` and log in
2. Open the test page: `/test/session-expiration`
3. Click **"Clear Session Cookie"** to simulate session expiration
4. Try to interact with the dashboard - you should see:
   - "Your session has expired" message
   - Automatic redirect to login page after ~1.5 seconds
   - **NOT** a raw JSON object

#### Method 2: Automated Tests
Click any of these buttons to run full test scenarios:

- **"Test: Session Check Endpoint"**
  - Clears session cookie
  - Makes request to `/access/check` with no session
  - Verifies it returns 401 with JSON (not HTML)

- **"Test: Load Sessions"**
  - Clears session cookie
  - Makes request to `/access/sessions` with no session
  - Confirms proper error response with correct content-type

- **"Test: Multiple Requests"**
  - Tests all three main endpoints sequentially with expired session
  - Shows which endpoints properly handle expiration

- **"Run All Tests"**
  - Executes all automated tests in sequence

#### Method 3: Real-world Scenario Testing
For the most realistic test:

1. **Step 1: Start a logged-in session**
   ```
   Go to /facilitator/dashboard
   Log in with your access key (institution + password)
   Wait for the dashboard to fully load
   ```

2. **Step 2: Simulate time passing (session expiration)**
   - Open browser DevTools (F12)
   - Application → Cookies → find `connect.sid`
   - Delete the cookie
   - Or use the test page to clear it

3. **Step 3: Trigger an API call**
   - Try any action on the dashboard:
     - Load sessions
     - Load game data
     - Select/delete sessions
   - **Expected behavior**: 
     - You'll see "Your session has expired" notification
     - Dashboard will redirect to login after 1.5 seconds
     - No raw JSON will be displayed

### Test Results Interpretation

✅ **Test PASSED** means:
- Server returned 401/403 status
- Response was JSON (with `loginUrl`)
- Browser won't show raw data to user

❌ **Test FAILED** means:
- Response wasn't JSON (was HTML)
- Response was unexpected status code
- Server didn't include `loginUrl` field

## Expected Behavior in Production

When deployed (e.g., to Render.com), the same protection applies:

1. User logs in at `/facilitator/dashboard`
2. User leaves browser open for 24 hours (session timeout)
3. User tries to interact with dashboard
4. **Instead of seeing:** `{"error": "Unauthorized", ...}`
5. **They see:** "Your session has expired. Redirecting to login..." 
6. **Then redirected to:** Login page

## Code Changes Reference

### File: `public/js/access.js`
- **Added:** `secureApiCall()` wrapper function (lines 5-40)
- **Modified:** All fetch calls now use `secureApiCall()` instead of `fetch()`
- **Added:** Session expiration checks after each API call

### File: `controllers/routeController.js`
- **Added:** Test route to serve session-expiration-test.html

## Debugging Tips

If something isn't working as expected:

1. **Check browser console (DevTools → Console)**
   - Look for messages like "Session expired (401). Redirecting to login..."
   - Check for any JavaScript errors

2. **Check Network tab**
   - When making API calls with expired session:
   - Should see 401/403 response
   - Response should be JSON (not HTML)
   - Should include `loginUrl` field

3. **Test with different endpoints**
   - Use the automated tests to identify which endpoint has issues
   - If one test fails, others should show the pattern

4. **Session cookie format**
   - Default Express session cookie: `connect.sid`
   - Find it in DevTools → Application → Cookies
   - Delete to immediately expire session

## Advanced: Server-Side Timeout Configuration

> Note: These endpoints require server support and are for testing only

If your server supports dynamic timeout configuration:

```bash
# Set session timeout to 5 seconds (for rapid testing)
POST /test/session-timeout/5000

# Reset to default (24 hours)
POST /test/session-timeout/reset
```

Use these to test timeout scenarios without manual cookie deletion:
1. Click "Setup 5s Timeout"
2. Log in at `/facilitator/dashboard`
3. Wait 6 seconds without making requests
4. Try to load sessions
5. Should redirect to login

## Monitoring Session Expiration in Production

To monitor real-world session expirations:

1. Check server logs for 401/403 responses
2. Monitor JavaScript console errors in user's browsers
3. Track redirect patterns to login page
4. Monitor failed API calls

## Related Files

- [access.html](../public/access.html) - Login page UI
- [access.js](../public/js/access.js) - Dashboard logic with timeout handling
- [authController.js](../controllers/authController.js) - Authentication middleware
- [session-expiration-test.html](../public/session-expiration-test.html) - This test page

## Questions or Issues?

If the test doesn't work as expected:

1. Verify your server is running (`npm start`)
2. Check that you're on `http://localhost:3000/test/session-expiration`
3. Review browser console for errors
4. Check server logs for any exceptions
5. Verify session middleware is configured in `authController.js`
