import { z } from 'zod';
export const enquirySchema=z.object({full_name:z.string().trim().min(2,'Enter your full name').max(120),phone:z.string().trim().min(8,'Enter a valid phone number').max(20),email:z.union([z.string().email(),z.literal('')]).optional(),interested_plan:z.string().max(120).optional(),preferred_start_date:z.string().optional(),message:z.string().max(2000).optional(),consent:z.boolean().refine(Boolean,'Please accept the privacy notice')});
export type EnquiryInput=z.infer<typeof enquirySchema>;
export const inr=(amount:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(amount||0);
