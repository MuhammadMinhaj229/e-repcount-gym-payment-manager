import { useState } from 'react';
import { Link,useNavigate,useParams } from 'react-router-dom';
import { useFetch } from '@/hooks/useFetch';
import { sdk } from '@/services/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import ApperIcon from '@/components/ApperIcon';
import { adjustFeeCycleForPayment, logMutationError } from '@/utils/repcount';
import { useProfile } from '@/hooks/useProfile';
import { getTableAccess } from '@/services/userPermissions';
export const route={path:'/payments/:id',layout:'owner',access:"profile === 'Admin_c' || profile === 'Manager_c' || profile === 'Staff_c'"};
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value||0));
export default function PaymentDetail(){
 const {id}=useParams();const navigate=useNavigate();
 const {data:payment,loading,error,run}=useFetch(()=>sdk.table('payments_c').select(['Id','Name','member_c','due_c','amount_c','paid_on_c','method_c','status_c','notes_c']).get(id).then(result=>result.data),[id]);
 const [editing,setEditing]=useState(false);const [form,setForm]=useState(null);const [saving,setSaving]=useState(false);const {profile}=useProfile();const {canUpdate,canDelete}=getTableAccess(profile,'payments_c');
 if(loading&&payment===undefined)return <div className="h-56 animate-pulse rounded-lg bg-muted"/>;
 if(error||!payment)return <div className="space-y-3"><Link to="/payments" className="text-sm text-primary">Back to payments</Link><p>{error?'Could not load payment.':'Payment not found.'}</p></div>;
 const values=form||{Name:payment.Name,amount_c:String(payment.amount_c),paid_on_c:payment.paid_on_c||'',method_c:payment.method_c||'UPI',status_c:payment.status_c||'Paid',notes_c:payment.notes_c||''};
 async function save(event){
  event.preventDefault();
  const nextAmount = Number(values.amount_c);
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) return toast.error('Enter a payment amount greater than zero.');
  setSaving(true);
  try {
    const dueId = payment.due_c?.Id;
    const oldCredit = payment.status_c === 'Paid' ? Number(payment.amount_c || 0) : 0;
    const newCredit = values.status_c === 'Paid' ? nextAmount : 0;
    const delta = newCredit - oldCredit;
    if (dueId && delta > 0) {
      const currentDue = await sdk.table('membership_dues_c')
        .select(['Id', 'amount_due_c', 'amount_paid_c', 'balance_c', 'status_c'])
        .get(dueId);
      if (!currentDue.success || !currentDue.data) {
        throw new Error(currentDue.message || 'The linked fee cycle could not be loaded.');
      }
      if (delta > Number(currentDue.data.balance_c || 0)) {
        toast.error('This payment change would exceed the remaining fee-cycle balance.');
        return;
      }
    }
    const result = await sdk.table('payments_c').update({Id:payment.Id,...values,amount_c:nextAmount});
    if (result.messages?.length) { toast.error(result.messages[0]); logMutationError('payment','update',result.messages.join('; ')); }
    if (!result.data?.length) {
      if (!result.messages?.length) { toast.error('The payment could not be updated.'); logMutationError('payment','update','No record returned by SDK'); }
      return;
    }
    if (dueId && delta !== 0) {
      try {
        await adjustFeeCycleForPayment(sdk, dueId, delta);
      } catch (syncError) {
        logMutationError('fee cycle balance','update after payment edit',syncError);
        toast.warning('Payment updated, but the linked fee-cycle balance needs review.');
      }
    }
    toast.success('Payment updated');
    setEditing(false);
    setForm(null);
    run();
  } catch(error) {
    toast.error(error.message||'Could not update payment');
    logMutationError('payment','update',error);
  } finally { setSaving(false); }
}
 async function remove(){
  try {
    const result = await sdk.table('payments_c').remove(payment.Id);
    if (result.messages?.length) { toast.error(result.messages[0]); logMutationError('payment','delete',result.messages.join('; ')); }
    if (!result.data?.length) {
      if (!result.messages?.length) { toast.error('The payment could not be deleted.'); logMutationError('payment','delete','No record returned by SDK'); }
      return;
    }
    if (payment.due_c?.Id && payment.status_c === 'Paid') {
      try {
        await adjustFeeCycleForPayment(sdk, payment.due_c.Id, -Number(payment.amount_c || 0));
      } catch (syncError) {
        logMutationError('fee cycle balance','update after payment deletion',syncError);
        toast.warning('Payment deleted, but the linked fee-cycle balance needs review.');
      }
    }
    toast.success('Payment deleted');
    navigate('/payments');
  } catch(error) {
    toast.error(error.message||'Could not delete payment');
    logMutationError('payment','delete',error);
  }
}
 return <div className="mx-auto max-w-3xl space-y-5"><Link to="/payments" className="inline-flex min-h-10 items-center text-sm font-semibold text-muted-foreground"><ApperIcon name="ArrowLeft" size={16} className="mr-2"/>Back to payments</Link><section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Payment receipt</p><h1 className="mt-2 font-heading text-2xl font-bold">{payment.Name}</h1><p className="mt-1 text-sm text-muted-foreground">{payment.member_c?.Name||'Member'} · {payment.paid_on_c}</p></div><div className="flex gap-2">{canUpdate&&<Button onClick={()=>{setForm(values);setEditing(!editing);}}><ApperIcon name="Pencil" size={16} className="mr-2"/>{editing?'Close edit':'Edit payment'}</Button>}{canDelete&&<AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="icon" aria-label="Delete payment"><ApperIcon name="Trash2" size={16}/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete payment {payment.Name}?</AlertDialogTitle><AlertDialogDescription>This removes the record from the payment register. Review the linked fee cycle before proceeding.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete payment</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></section>{editing&&canUpdate&&<form onSubmit={save} className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="Name">Receipt number</Label><Input id="Name" placeholder="RC-000123" value={values.Name} onChange={event=>setForm({...values,Name:event.target.value})} required/></div><div className="space-y-2"><Label htmlFor="amount_c">Amount (₹)</Label><Input id="amount_c" type="number" min="0.01" step="0.01" placeholder="1200.00" value={values.amount_c} onChange={event=>setForm({...values,amount_c:event.target.value})} required/></div><div className="space-y-2"><Label htmlFor="paid_on_c">Payment date</Label><Input id="paid_on_c" type="date" value={values.paid_on_c} onChange={event=>setForm({...values,paid_on_c:event.target.value})}/></div><div className="space-y-2"><Label htmlFor="method_c">Method</Label><select id="method_c" value={values.method_c} onChange={event=>setForm({...values,method_c:event.target.value})} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">{['Cash','UPI','Card','Bank transfer'].map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-2"><Label htmlFor="status_c">Status</Label><select id="status_c" value={values.status_c} onChange={event=>setForm({...values,status_c:event.target.value})} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">{['Paid','Pending','Refunded'].map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="notes_c">Notes</Label><textarea id="notes_c" rows={3} placeholder="Optional receipt note" value={values.notes_c} onChange={event=>setForm({...values,notes_c:event.target.value})} className="w-full rounded-md border border-input bg-background p-3 text-sm"/></div><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={()=>{setEditing(false);setForm(null);}}>Cancel</Button><Button disabled={saving}>{saving?'Saving…':'Save changes'}</Button></div></form>}<section className="rounded-lg border border-border bg-card p-5 md:p-7"><p className="text-sm text-muted-foreground">Amount recorded</p><p className="mt-2 font-heading text-4xl font-bold">{money(payment.amount_c)}</p><dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">{[['Member',payment.member_c?.Name],['Fee cycle',payment.due_c?.Name],['Payment date',payment.paid_on_c],['Method',payment.method_c],['Status',payment.status_c],['Notes',payment.notes_c]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value||'—'}</dd></div>)}</dl>{payment.member_c?.Id&&<Button asChild variant="outline" className="mt-5 min-h-11"><Link to={`/members/${payment.member_c.Id}`}>Open member profile <ApperIcon name="ArrowUpRight" size={16} className="ml-2"/></Link></Button>}</section></div>
}
