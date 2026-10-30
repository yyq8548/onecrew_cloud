import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import CloudApp from './App';
import { CloudApiContext } from './ApiContext';
import { cloudApi, createCloudApi } from './api';
import '../styles/index.css';
import { cloudI18n as i18n, initializeCloudI18n } from './i18n';

await initializeCloudI18n();
const local = document.querySelector('meta[name="onecrew-cloud-local"]')?.getAttribute('content') === 'true';
const accountWorkspace = document.querySelector('meta[name="onecrew-cloud-account"]')?.getAttribute('content');
let api = cloudApi;
if (accountWorkspace) {
  if (!/^local:[a-f0-9]{64}$/.test(accountWorkspace)) throw new Error(i18n.t('工作区信息无效，请重新登录。', { ns: 'cloud' }));
  api = createCloudApi(async () => null, false, accountWorkspace);
} else if (local) {
  const token = location.hash.slice(1) || sessionStorage.getItem('onecrew-cloud-local-session') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error(i18n.t('请使用本机启动器生成的工作台链接。', { ns: 'cloud' }));
  sessionStorage.setItem('onecrew-cloud-local-session', token);
  history.replaceState(null, '', location.pathname + location.search);
  api = createCloudApi(async () => token, true);
}
createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18n}><CloudApiContext.Provider value={api}><CloudApp local={local} account={!!accountWorkspace} /></CloudApiContext.Provider></I18nextProvider>);
