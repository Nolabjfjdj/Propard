import axios from 'axios';

export const API_URL = 'https://propard.site';

const api = axios.create({
  baseURL: API_URL
});

export default api;