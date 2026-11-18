import { paidForBill,effectiveSettlement,orderBalance } from "./domain.js";
export function projectStaffOrder(order,permissions=[]) {
 const value={...order,effectivePaid:paidForBill(order),effectiveSettlement:effectiveSettlement(order),outstandingBalance:orderBalance(order)};
 if(!permissions.some(p=>["billing.manage","organization.manage"].includes(p))){delete value.financialPolicy;delete value.policyVersion;}
 return value;
}
