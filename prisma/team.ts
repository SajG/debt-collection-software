import type { Role } from "@prisma/client";

export type TeamRow = {
  ownerName: string;
  role: Role;
  /** 10-digit local number or "PENDING" for rows we intentionally skip. */
  phone: string;
  note?: string;
};

export const TEAM: TeamRow[] = [
  { ownerName: "Vaibhav Ghatpande", role: "ADMIN",   phone: "9371635315" },
  { ownerName: "Sajal Ghatpande",   role: "ADMIN",   phone: "7774055316" },

  { ownerName: "Chaitanya Deshpande", role: "FACTORY", phone: "8626010898" },
  { ownerName: "Mahesh Jadhav",       role: "FACTORY", phone: "9604558658" },
  {
    ownerName: "Seema Patil",
    role: "FACTORY",
    phone: "9921336535",
    note: "accountant; needs order rates for invoicing",
  },
  { ownerName: "Sachin Haveli",       role: "FACTORY", phone: "9923139100" },

  { ownerName: "Sanjay Thorat",   role: "STAFF", phone: "9552670106" },
  { ownerName: "Vikas Chaudhari", role: "STAFF", phone: "7020791094" },
  { ownerName: "Sunil Karle",     role: "STAFF", phone: "7709545662" },
  { ownerName: "Irshad Jamadar",  role: "STAFF", phone: "9158464446" },
  { ownerName: "Om Sharma",       role: "STAFF", phone: "9822569216" },
  { ownerName: "Monesh Pattar",   role: "STAFF", phone: "9901112508" },
  { ownerName: "Sunil Gaikwad",   role: "STAFF", phone: "9975370106" },
  { ownerName: "Nitin Kosandar",  role: "STAFF", phone: "7028166235" },
];

export const PHONE_10 = /^[6-9]\d{9}$/;

export function toE164(local: string): string {
  return `+91${local}`;
}
