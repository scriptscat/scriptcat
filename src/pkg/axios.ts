/* eslint-disable import/prefer-default-export */

import { ExtServer } from "@App/app/const";
import axios from "axios";

export const api = axios.create({
  baseURL: `${ExtServer}api/v1`,
  validateStatus(status) {
    return status < 500;
  },
});
