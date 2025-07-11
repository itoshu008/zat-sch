import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';  // ←ファイル名がApp.jsで、export default Appされてる前提

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
