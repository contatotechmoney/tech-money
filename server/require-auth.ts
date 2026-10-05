import type {RequestHandler} from "express";
import {getAuth} from "@clerk/express";

// Shared by the portal and the isolated development harness.
export const requireAuth: RequestHandler = (req,res,next) => {
  const {userId}=getAuth(req);
  if(!userId) return res.status(401).json({error:"Unauthorized"});
  req.userId=userId;
  next();
};
