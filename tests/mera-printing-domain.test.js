import test from 'node:test';
import assert from 'node:assert/strict';
import {eligiblePaidDocuments} from '../server/mera/printing.js';
test('paid documents exclude partial, historical, write-off and cancelled orders',()=>{
 const paid={total:10000,paid:10000,refunded:0,status:'accepted',paymentStatus:'paid'};
 assert.equal(eligiblePaidDocuments(paid),true);
 for(const patch of [{paid:5000,paymentStatus:'partial'},{historicalReadOnly:true},{writtenOff:100},{status:'cancelled'},{total:0,paid:0},{cancellationRefundApplied:100}])assert.equal(eligiblePaidDocuments({...paid,...patch}),false);
});
