// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import "./assets/main.css" // ou main.css
import { HashRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);