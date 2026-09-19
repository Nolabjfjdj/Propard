import axios from 'axios';

const api = axios.create({
  baseURL: 'https://propard.site'
});

export default api;