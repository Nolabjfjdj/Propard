import axios from 'axios';

export const API_URL = window.location.origin;

const api = axios.create({
  baseURL: API_URL
});

export default api;
