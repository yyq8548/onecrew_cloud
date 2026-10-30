import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isSupportedLocale, LOCALE_STORAGE_KEY, persistLocale } from '../i18n/locale';
import commonZh from '../i18n/locales/zh-CN/common';
import commonEn from '../i18n/locales/en-US/common';
import shellZh from '../i18n/locales/zh-CN/shell';
import shellEn from '../i18n/locales/en-US/shell';
import english from './translations/en';

export const cloudI18n = i18next.createInstance();
export async function initializeCloudI18n() {
  let language = 'en-US';
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(saved)) language = saved;
  } catch {
    // 隐身或第三方存储受限时，仍可使用默认英文界面。
  }
  cloudI18n.on('languageChanged', language => {
    document.documentElement.lang = language;
    if (language === 'zh-CN' || language === 'en-US') persistLocale(language);
  });
  await cloudI18n.use(initReactI18next).init({
    lng: language, fallbackLng: 'zh-CN', supportedLngs: ['zh-CN', 'en-US'],
    defaultNS: 'cloud', interpolation: { escapeValue: false },
    resources: {
      'zh-CN': { common: commonZh, shell: shellZh, cloud: {} },
      'en-US': { common: commonEn, shell: shellEn, cloud: english },
    },
  });
}
