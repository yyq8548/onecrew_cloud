import { createContext, useContext } from 'react';
import { cloudApi } from './api';

export const CloudApiContext = createContext(cloudApi);
export function useCloudApi() { return useContext(CloudApiContext); }
