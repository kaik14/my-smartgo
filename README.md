# SmartGo - AI-Powered Itinerary Planner

SmartGo is a web application designed to simplify travel planning. It leverages the power of Google's Gemini AI to automatically generate personalized travel itineraries, integrated with rich location data from Google Maps.

## ✨ Core Features

- **🤖 AI Itinerary Generation**: Automatically create detailed, day-by-day trip plans using generative AI.
- **🗺️ Interactive Trip Management**: Easily create, view, and customize your travel plans.
- **📍 Rich POI Details**: Access in-depth information about points of interest, powered by the Google Places API.
- **👤 User Authentication**: Sign up and log in to save and manage your trips.
- **❤️ Favorites**: Keep a list of your favorite locations for future reference.
- **🌏 Nearby Places**: Discover interesting spots around your current location.

## 🛠️ Tech Stack

- **Frontend**:
  - [React](https://react.dev/)
  - [Vite](https://vitejs.dev/)
  - CSS 3

- **Backend**:
  - [Node.js](https://nodejs.org/)
  - [Express.js](https://expressjs.com/)

- **Services & APIs**:
  - [Google Gemini API](https://ai.google.dev/) for itinerary generation.
  - [Google Geocoding API](https://developers.google.com/maps/documentation/geocoding) for address lookup.
  - [Google Places API](https://developers.google.com/maps/documentation/places/web-service) for location details.

## 🚀 Getting Started

Follow these instructions to set up and run the project on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) (v18.x or later is recommended)
- [npm](https://www.npmjs.com/get-npm) (usually comes with Node.js)

### 1. Server Setup

First, set up the backend server:

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install
```

Next, create a `.env` file in the `server` directory. This file will store your secret API keys. Add the following content, replacing the placeholder values with your actual keys:

```env
# Google API Key for Maps, Places, and Geocoding
GOOGLE_API_KEY=your_google_api_key_here

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Your MongoDB connection string (or other database URI)
MONGO_URI=your_mongodb_connection_string_here

# Port for the server to run on
PORT=3001
```

Now, you can start the server:

```bash
# Start the backend server
npm start
```

The server should now be running on `http://localhost:3001`.

### 2. Client Setup

In a new terminal window, set up the frontend client:

```bash
# Navigate to the client directory from the root folder
cd client

# Install dependencies
npm install
```

The client is configured to proxy API requests to the backend server running on `localhost:3001` (see `vite.config.js`).

Now, you can start the client:

```bash
# Start the React development server
npm run dev
```

The application should now be running and accessible in your browser, typically at `http://localhost:5173`.
