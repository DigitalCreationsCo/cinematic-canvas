import { v7 as uuidv7 } from "uuid";
import { nanoid } from 'nanoid';

export const generateId = () => uuidv7();
export const generateNanoId = (size = 6) => nanoid(size);