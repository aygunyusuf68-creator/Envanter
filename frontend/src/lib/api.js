import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

const client = axios.create({
    baseURL: API,
    withCredentials: true,
});

client.interceptors.request.use((config) => {
    const t = localStorage.getItem("token");
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

export default client;
