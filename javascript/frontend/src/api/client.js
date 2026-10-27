import axios from 'axios';
import { config } from '../config';
export const api = axios.create({
    baseURL: config.apiBaseUrl,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
});
export const authApi = axios.create({
    baseURL: config.authBaseUrl,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
});
api.interceptors.response.use((res) => res, (err) => {
    if (err.response?.status === 401) {
        window.location.href = '/login';
    }
    return Promise.reject(err);
});
authApi.interceptors.response.use((res) => res, (err) => {
    if (err.response?.status === 401) {
        window.location.href = '/login';
    }
    return Promise.reject(err);
});
