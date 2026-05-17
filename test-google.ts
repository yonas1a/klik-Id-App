import { getGoogleAccessToken } from './src/lib/googleApi.ts';
import dotenv from 'dotenv';
dotenv.config();

// Mock import.meta.env for the node script since we are not in Vite
(global as any).import = {
  meta: {
    env: process.env
  }
};

async function test() {
  try {
    const token = await getGoogleAccessToken();
    console.log("Token success:", token.substring(0, 20) + "...");
  } catch (err) {
    console.error("Token failed:", err);
  }
}
test();
