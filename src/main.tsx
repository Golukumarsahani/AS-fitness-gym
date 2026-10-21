import React from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import App from './App'; import { LangProvider } from './lib/i18n'; import { registerSW } from './lib/pwa'; import './styles.css';
registerSW();
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><LangProvider><App /></LangProvider></BrowserRouter></React.StrictMode>);
