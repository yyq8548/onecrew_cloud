import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import CloudApp from './App';
import '../styles/index.css';
import shell from '../i18n/locales/zh-CN/shell';
import common from '../i18n/locales/zh-CN/common';

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({ lng: 'zh-CN', resources: { 'zh-CN': {
  common,
  shell,
} }, interpolation: { escapeValue: false } });
createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18n}><CloudApp /></I18nextProvider>);
