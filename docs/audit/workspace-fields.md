# Workspace field declaration inventory

Source-only evidence. Dynamic/mapped controls retain source expressions; not every row is visible simultaneously. Root browser audit establishes runtime visibility.

| File:line | Label | Control | Required | Value/consumer |
|---|---|---|---|---|
| src/mera/workspace/Bills.tsx:549 | "Bill to manage" | Combobox  | not declared | {form.billId \|\| ""} → {(value) => { if (inFlight.current \|\| pendingRef.current \|\| markerRef.current) return; setForm({ billId: value }); setItems({}); }} |
| src/mera/workspace/Bills.tsx:629 | New bill name | input  | true | {form.name \|\| ""} → {(e) => update("name", e.target.value)} |
| src/mera/workspace/Bills.tsx:636 | "Split by" | Segmented  | not declared | {form.splitMode \|\| "amount"} → {(value) => update("splitMode", value)} |
| src/mera/workspace/Bills.tsx:664 | {"Move quantity of " + charge.name} | Stepper  | not declared | {items[charge.id] \|\| 0} → {(value) => { if ( inFlight.current \|\| pendingRef.current \|\| markerRef.current ) return; setItems({ ...items, [charge.id]: value }); }} |
| src/mera/workspace/Bills.tsx:688 | "Amount to move (naira)" | MoneyInput  | true | {String(form.amount \|\| "")} → {(value) => update("amount", value)} |
| src/mera/workspace/Bills.tsx:729 | "Merge another bill into this one" | Combobox  | true | {form.sourceBill \|\| ""} → {(value) => update("sourceBill", value)} |
| src/mera/workspace/Bills.tsx:777 | "Amount received (naira)" | MoneyInput  | true | {String(form.paymentAmount \|\| "")} → {(value) => update("paymentAmount", value)} |
| src/mera/workspace/Bills.tsx:789 | "Method" | Segmented  | not declared | {form.method \|\| "cash"} → {(value) => update("method", value)} |
| src/mera/workspace/Bills.tsx:804 | Verified reference | input  | {form.method === "external_transfer"} | {form.reference \|\| ""} → {(e) => update("reference", e.target.value)} |
| src/mera/workspace/BranchAdministration.tsx:415 | Branch name | input  | true | {draft.name} → {(event) => setDraft({ ...draft, name: event.target.value }) } |
| src/mera/workspace/BranchAdministration.tsx:426 | Timezone | input  | true | {draft.timezone} → {(event) => setDraft({ ...draft, timezone: event.target.value }) } |
| src/mera/workspace/BranchAdministration.tsx:434 | {<>Currency</>} | ChoiceField  | not declared | {draft.currency} → {() => {}} |
| src/mera/workspace/BranchAdministration.tsx:443 | Trading day starts | input "time" | true | { String(Math.floor(draft.cutoff / 60)).padStart(2, "0") + ":" + String(draft.cutoff % 60).padStart(2, "0") } → {(event) => { const [hours, minutes] = event.target.value .split(":") .map(Number); setDraft({ ...draft, cutoff: hours * 60 + minutes }); }} |
| src/mera/workspace/BranchAdministration.tsx:463 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {draft.serviceModes.includes(mode)} → {(event) => setDraft({ ...draft, serviceModes: event.target.checked ? [...draft.serviceModes, mode] : draft.serviceModes.filter( (value) => value !== mode, ), }) } |
| src/mera/workspace/BranchSettings.tsx:215 | Branch address | input  | not declared | {settings.address} → {(event) => setSettings({ ...settings, address: event.target.value }) } |
| src/mera/workspace/BranchSettings.tsx:223 | "Branch timezone" | Combobox  | true | {settings.timezone} → {(timezone) => setSettings({ ...settings, timezone })} |
| src/mera/workspace/BranchSettings.tsx:258 | {label} | Switch  | not declared | {settings.serviceModes.includes(mode)} → {(checked) => setSettings((current) => ({ ...current, serviceModes: checked ? [...current.serviceModes, mode] : current.serviceModes.filter((value) => value !== mode), })) } |
| src/mera/workspace/BranchSettings.tsx:272 | "Pause new orders" | Switch  | not declared | {settings.orderingPaused} → {(orderingPaused) => setSettings({ ...settings, orderingPaused }) } |
| src/mera/workspace/BranchSettings.tsx:279 | "Show sold-out items" | Switch  | not declared | {settings.showSoldOut} → {(showSoldOut) => setSettings({ ...settings, showSoldOut }) } |
| src/mera/workspace/BranchSettings.tsx:286 | "Stock hold (minutes)" | Stepper  | true | {settings.holdMinutes} → {(holdMinutes) => setSettings({ ...settings, holdMinutes }) } |
| src/mera/workspace/BranchSettings.tsx:306 | Trading day starts | input "time" | true | { String(Math.floor(settings.cutoff / 60)).padStart(2, "0") + ":" + String(settings.cutoff % 60).padStart(2, "0") } → {(event) => { const [hours, minutes] = event.target.value .split(":") .map(Number); setSettings({ ...settings, cutoff: hours * 60 + minutes }); }} |
| src/mera/workspace/BranchSettings.tsx:338 | "Allow preparation before full payment" | Switch  | not declared | {settings.payLater} → {(payLater) => setSettings({ ...settings, payLater })} |
| src/mera/workspace/BranchSettings.tsx:355 | "Accept reservations" | Switch  | not declared | {settings.reservationsEnabled} → {(reservationsEnabled) => setSettings({ ...settings, reservationsEnabled }) } |
| src/mera/workspace/BranchSettings.tsx:362 | "Reservation capacity" | Stepper  | true | {settings.capacity} → {(capacity) => setSettings({ ...settings, capacity })} |
| src/mera/workspace/BranchSettings.tsx:541 | "Approved font" | Segmented  | not declared | {branding.font} → {(font) => setBranding({ ...branding, font })} |
| src/mera/workspace/BranchSettings.tsx:553 | Brand description | textarea  | not declared | {branding.description} → {(event) => setBranding({ ...branding, description: event.target.value }) } |
| src/mera/workspace/BrandColorField.tsx:18 | (dynamic/unlabelled; name=none) | input "color" | not declared | {value} → {(event) => onChange(event.target.value)} |
| src/mera/workspace/BrandColorField.tsx:26 | hex | input "text" | true | {text} → {(event) => { const next = event.target.value; setText(next); if (valid(next)) onChange(next); }} |
| src/mera/workspace/BusinessDetails.tsx:207 | Business contact | input  | true | {draft.contact} → {(event) => edit({ contact: event.target.value })} |
| src/mera/workspace/BusinessDetails.tsx:216 | Phone | input "tel" | not declared | {formatBusinessPhone(draft.phone)} → {(event) => edit({ phone: normalizeBusinessPhone(event.target.value) }) } |
| src/mera/workspace/BusinessDetails.tsx:227 | {<>Primary service</>} | ChoiceField  | not declared | {draft.serviceMode} → {(nextValue) => edit({ serviceMode: nextValue })} |
| src/mera/workspace/CashMovement.tsx:113 | "Cash movement" | Segmented  | not declared | {direction} → {setDirection} |
| src/mera/workspace/CashMovement.tsx:122 | "Movement amount (naira)" | MoneyInput  | true | {amount} → {setAmount} |
| src/mera/workspace/CashMovement.tsx:129 | "Movement reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/CatalogOperations.tsx:105 | Find products for availability | input "search" | not declared | {query} → {(event) => setQuery(event.target.value)} |
| src/mera/workspace/CatalogOperations.tsx:134 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {selected.includes(product.id)} → {(event) => setSelected((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id), ) } |
| src/mera/workspace/CatalogOperations.tsx:153 | {<>New availability</>} | ChoiceField  | not declared | {String(available)} → {(nextValue) => setAvailable(nextValue === "true")} |
| src/mera/workspace/CatalogOperations.tsx:163 | Bulk availability reason | input  | true | {reason} → {(event) => setReason(event.target.value)} |
| src/mera/workspace/Categories.tsx:157 | Category name | input  | true | {draft.name} → {(event) => setDraft({ ...draft, name: event.target.value }) } |
| src/mera/workspace/Categories.tsx:166 | {<>Parent category</>} | ChoiceField  | not declared | {draft.parentId \|\| ""} → {(nextValue) => setDraft({ ...draft, parentId: nextValue \|\| null }) } |
| src/mera/workspace/Categories.tsx:185 | Category sort order | input "number" | true | {draft.sortOrder} → {(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) }) } |
| src/mera/workspace/Categories.tsx:199 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {draft.active} → {(event) => setDraft({ ...draft, active: event.target.checked }) } |
| src/mera/workspace/CreateOrganization.tsx:224 | Organization name | input  | true | {name} → {(e) => setName(e.target.value)} |
| src/mera/workspace/CreateOrganization.tsx:234 | (dynamic/unlabelled; name=none) | input  | true | {slug} → {(e) => { setSlug(e.target.value); checkSequence.current++; setChecking(false); setAvailability(null); }} |
| src/mera/workspace/CreateOrganization.tsx:267 | First branch name | input  | true | {branch} → {(e) => setBranch(e.target.value)} |
| src/mera/workspace/CustomerCare.tsx:213 | Find feedback | input "search" | not declared | {query} → {(event) => setQuery(event.target.value)} |
| src/mera/workspace/CustomerCare.tsx:220 | {<>Filter care records</>} | ChoiceField  | not declared | {filter} → {(nextValue) => setFilter(nextValue)} |
| src/mera/workspace/CustomerCare.tsx:353 | {<>Case status</>} | ChoiceField  | not declared | {draft.status} → {(nextValue) => change({ status: nextValue })} |
| src/mera/workspace/CustomerCare.tsx:366 | Resolution | textarea  | {draft.status === "resolved"} | {draft.resolution} → {(event) => change({ resolution: event.target.value }) } |
| src/mera/workspace/DepositOutcomes.tsx:135 | "Deposit under review" | Combobox  | true | {depositId} → {(value) => { setDepositId(value); setReviewed(false); }} |
| src/mera/workspace/DepositOutcomes.tsx:152 | "Reviewed deposit outcome" | Segmented  | true | {outcome} → {(value) => { setOutcome(value); setReviewed(false); setReturned(false); }} |
| src/mera/workspace/DepositOutcomes.tsx:180 | "Deposit outcome amount (naira)" | MoneyInput  | true | {String(amount)} → {(value) => setAmount(value)} |
| src/mera/workspace/DepositOutcomes.tsx:191 | "Actual deposit return method" | Segmented  | true | {method} → {setMethod} |
| src/mera/workspace/DepositOutcomes.tsx:210 | Deposit return reference | input  | {method === "external_transfer"} | {reference} → {(event) => setReference(event.target.value)} |
| src/mera/workspace/DepositOutcomes.tsx:221 | "Forfeiture tax review" | Segmented  | true | {taxChoice} → {setTaxChoice} |
| src/mera/workspace/DepositOutcomes.tsx:238 | "Forfeiture tax amount (naira)" | MoneyInput  | true | {String(tax)} → {(value) => setTax(value)} |
| src/mera/workspace/DepositOutcomes.tsx:260 | "Deposit outcome reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/DepositOutcomes.tsx:278 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {reviewed} → {(event) => setReviewed(event.target.checked)} |
| src/mera/workspace/DepositOutcomes.tsx:291 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {returned} → {(event) => setReturned(event.target.checked)} |
| src/mera/workspace/DepositPolicy.tsx:62 | "Require manual deposit" | Switch  | not declared | {draft.enabled} → {(enabled) => setDraft({ ...draft, enabled })} |
| src/mera/workspace/DepositPolicy.tsx:68 | "Deposit amount (naira)" | MoneyInput  | true | {draft.amount} → {(amount) => setDraft({ ...draft, amount })} |
| src/mera/workspace/DepositPolicy.tsx:78 | Cancellation cutoff (hours) | input "number" | true | {draft.cancellationCutoffHours} → {(e) => setDraft({ ...draft, cancellationCutoffHours: e.target.value }) } |
| src/mera/workspace/DepositPolicy.tsx:89 | "Refund rule" | Segmented  | true | {draft.refundRule} → {(refundRule) => setDraft({ ...draft, refundRule })} |
| src/mera/workspace/DepositPolicy.tsx:107 | I am authorized to approve these specific deposit and cancellation terms. | input "checkbox" | not declared | {acknowledged} → {(e) => setAcknowledged(e.target.checked)} |
| src/mera/workspace/ExportJobs.tsx:363 | Retry reason | input  | true | {reasons[job.id] \|\| ""} → {(event) => setReasons({ ...reasons, [job.id]: event.target.value, }) } |
| src/mera/workspace/ExportJobs.tsx:442 | "Choose a trading day" | Chips  | not declared | {dayPreset} → {chooseDay} |
| src/mera/workspace/ExportJobs.tsx:462 | Business date | input "date" | true | {date} → {(event) => { setDate(event.target.value); setDayPreset("custom"); }} |
| src/mera/workspace/FloorMap.tsx:95 | {<>Map zone</>} | ChoiceField  | not declared | {zone} → {(nextValue) => { setZone(nextValue); setSelected(""); }} |
| src/mera/workspace/FloorMap.tsx:110 | {<>Map table</>} | ChoiceField  | not declared | {selected} → {(nextValue) => { const table = shown.find((row) => row.id === nextValue); if (table) select(table); else setSelected(""); }} |
| src/mera/workspace/FloorMap.tsx:268 | { key === "x" ? "Horizontal position" : "Vertical position" } | input "range" | not declared | {point[key]} → {(e) => setPoint({ ...point, [key]: Number(e.target.value) }) } |
| src/mera/workspace/HelpRequests.tsx:404 | {<>Help category</>} | ChoiceField  | not declared | {category} → {(nextValue) => setCategory(nextValue)} |
| src/mera/workspace/HelpRequests.tsx:516 | {<>Request status</>} | ChoiceField  | not declared | {status} → {(nextValue) => setStatus(nextValue)} |
| src/mera/workspace/HelpRequests.tsx:531 | Customer-visible reply | textarea  | not declared | {reply} → {(e) => setReply(e.target.value)} |
| src/mera/workspace/HelpRequests.tsx:539 | Private staff note | textarea  | not declared | {note} → {(e) => setNote(e.target.value)} |
| src/mera/workspace/Integrations.tsx:205 | New development credential | input  | not declared | {token} → (form serialization or parent) |
| src/mera/workspace/Integrations.tsx:313 | Credential name | input  | true | {name} → {(event) => setName(event.target.value)} |
| src/mera/workspace/Integrations.tsx:323 | {scopeLabel(scope)} | Switch  | not declared | {selected.includes(scope)} → {(checked) => setSelected((current) => checked ? [...current, scope] : current.filter((value) => value !== scope), ) } |
| src/mera/workspace/Invoices.tsx:274 | "Invoice period" | DateRangePresets  | not declared | {periodPreset} → {(range) => { setStart(range.from + "T00:00"); const last = new Date(range.to + "T00:00"); last.setDate(last.getDate() + 1); setEnd( `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}T00:00`, ); }} |
| src/mera/workspace/Invoices.tsx:294 | "Period starts" | DateTimePicker  | true | {start} → {(value) => { setStart(value); setPeriodPreset("custom"); }} |
| src/mera/workspace/Invoices.tsx:305 | "Period ends" | DateTimePicker  | true | {end} → {(value) => { setEnd(value); setPeriodPreset("custom"); }} |
| src/mera/workspace/ItemCancellation.tsx:143 | "Item to cancel" | Combobox  | true | {lineId} → {(value) => { setLineId(value); setQuantity(1); setReview(null); setAllocations({}); }} |
| src/mera/workspace/ItemCancellation.tsx:160 | "Quantity to cancel" | Stepper  | true | {quantity} → {(value) => { setQuantity(value); setReview(null); setAllocations({}); }} |
| src/mera/workspace/ItemCancellation.tsx:173 | "Cancellation reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/ItemCancellation.tsx:253 | {`Allocate refund ${refund.reference \|\| "credit"} · ${formatMoney(refund.amount - (refund.cancellationAppliedAmount \|\| 0))} unused`} | MoneyInput  | not declared | {allocations[refund.id] \|\| ""} → {(value) => setAllocations({ ...allocations, [refund.id]: value }) } |
| src/mera/workspace/ItemCancellation.tsx:331 | "Reviewed cancellation refund method" | Segmented  | true | {refundMethod} → {setRefundMethod} |
| src/mera/workspace/ItemCancellation.tsx:345 | "Reviewed cancellation refund reason" | ReasonInput  | true | {refundReason} → {setRefundReason} |
| src/mera/workspace/ItemCancellation.tsx:362 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {refundConfirmed} → {(event) => setRefundConfirmed(event.target.checked)} |
| src/mera/workspace/ItemFulfillment.tsx:295 | "Item to hand over" | Combobox  | true | {lineId} → {(value) => { const selected = actionable.find( (item: any) => item.orderLineId === value, ); setLineId(value); setQuantity((selected?.served ?? 0) + 1); setError(""); }} |
| src/mera/workspace/ItemFulfillment.tsx:320 | "Total handed over after this action" | Stepper  | true | {quantity} → {setQuantity} |
| src/mera/workspace/ItemFulfillment.tsx:333 | "Handoff note (optional)" | ReasonInput  | not declared | {reason} → {setReason} |
| src/mera/workspace/LaunchReadiness.tsx:160 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {methods.includes(method)} → {(event) => setMethods((current) => event.target.checked ? [...current, method] : current.filter((value) => value !== method), ) } |
| src/mera/workspace/LaunchReadiness.tsx:176 | Public customer contact | input  | true | {contact} → {(event) => setContact(event.target.value)} |
| src/mera/workspace/LaunchReadiness.tsx:189 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {acknowledged} → {(event) => setAcknowledged(event.target.checked)} |
| src/mera/workspace/LaunchReadiness.tsx:206 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {confirmed} → {(event) => setConfirmed(event.target.checked)} |
| src/mera/workspace/MemberAccess.tsx:281 | Find a staff member | input "search" | not declared | {search} → {(event) => setSearch(event.target.value)} |
| src/mera/workspace/MenuManagement.tsx:115 | Find a product | input "search" | not declared | {query} → {(event) => { setQuery(event.target.value); setLimit(12); }} |
| src/mera/workspace/MenuManagement.tsx:125 | {<>Product category</>} | ChoiceField  | not declared | {category} → {(nextValue) => { setCategory(nextValue); setLimit(12); }} |
| src/mera/workspace/MenuPublication.tsx:471 | Reason | textarea  | not declared | {reason} → {(event) => setReason(event.target.value)} |
| src/mera/workspace/MinimumSpendPolicy.tsx:65 | "Enable reviewed minimum spend for new visits" | Switch  | not declared | {draft.enabled} → {(enabled) => setDraft({ ...draft, enabled })} |
| src/mera/workspace/MinimumSpendPolicy.tsx:71 | "Minimum-spend amount (naira)" | MoneyInput  | {draft.enabled} | {draft.amount} → {(amount) => setDraft({ ...draft, amount })} |
| src/mera/workspace/MinimumSpendPolicy.tsx:80 | "Reviewed calculation basis" | Segmented  | {draft.enabled} | {draft.basis \|\| ""} → {(value) => setDraft({ ...draft, basis: value \|\| null })} |
| src/mera/workspace/MinimumSpendPolicy.tsx:92 | Customer disclosure | textarea  | {draft.enabled} | {draft.disclosure} → {(event) => setDraft({ ...draft, disclosure: event.target.value }) } |
| src/mera/workspace/MinimumSpendPolicy.tsx:105 | (dynamic/unlabelled; name=none) | input "checkbox" | {draft.enabled} | {approved} → {(event) => setApproved(event.target.checked)} |
| src/mera/workspace/ModifierGroupsEditor.tsx:47 | Group name | input  | true | {group.name} → {(event) => update(group.id, { name: event.target.value }) } |
| src/mera/workspace/ModifierGroupsEditor.tsx:56 | "Minimum choices" | Stepper  | true | {group.min} → {(value) => update(group.id, { min: value })} |
| src/mera/workspace/ModifierGroupsEditor.tsx:64 | "Maximum choices" | Stepper  | true | {group.max} → {(value) => update(group.id, { max: value })} |
| src/mera/workspace/ModifierGroupsEditor.tsx:81 | Option name | input  | true | {option.name} → {(event) => update(group.id, { options: group.options.map((row) => row.id === option.id ? { ...row, name: event.target.value } : row, ), }) } |
| src/mera/workspace/ModifierGroupsEditor.tsx:96 | "Option extra price (naira)" | MinorMoneyInput  | true | {option.price} → {(value) => update(group.id, { options: group.options.map((row) => row.id === option.id ? { ...row, price: value, } : row, ), }) } |
| src/mera/workspace/OrderHistory.tsx:393 | Search order history | input "search" | not declared | {draft.q} → {(event) => update("q", event.target.value)} |
| src/mera/workspace/OrderHistory.tsx:401 | {<>History records</>} | ChoiceField  | not declared | {draft.historical} → {(nextValue) => update("historical", nextValue)} |
| src/mera/workspace/OrderHistory.tsx:420 | {<>History order status</>} | ChoiceField  | not declared | {draft.status} → {(nextValue) => update("status", nextValue)} |
| src/mera/workspace/OrderHistory.tsx:443 | History source | input  | not declared | {draft.source} → {(event) => update("source", event.target.value)} |
| src/mera/workspace/OrderHistory.tsx:458 | {<>History payment status</>} | ChoiceField  | not declared | {draft.paymentStatus} → {(nextValue) => update("paymentStatus", nextValue)} |
| src/mera/workspace/OrderHistory.tsx:481 | History staff identity | input  | not declared | {draft.staffId} → {(event) => update("staffId", event.target.value)} |
| src/mera/workspace/OrderHistory.tsx:497 | "History from (device local time)" | DateTimePicker  | not declared | {draft.from} → {(value) => update("from", value)} |
| src/mera/workspace/OrderHistory.tsx:504 | "History until (exclusive, device local time)" | DateTimePicker  | not declared | {draft.to} → {(value) => update("to", value)} |
| src/mera/workspace/OrderHistory.tsx:511 | {<>Orders per page</>} | ChoiceField  | not declared | {draft.take} → {(nextValue) => update("take", Number(nextValue))} |
| src/mera/workspace/OrderHistory.tsx:522 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {draft.unassigned} → {(event) => update("unassigned", event.target.checked) } |
| src/mera/workspace/OrderResponsibility.tsx:307 | {<>Assign order to</>} | ChoiceField  | true | {selected} → {(nextValue) => setSelected(nextValue)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1034 | {label} | MoneyInput  | {required} | {String(tabForm[key] ?? "")} → {(value) => updateForm(key, value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1042 | {label} | Stepper  | {required} | {Number(tabForm[key] \|\| 1)} → {(value) => updateForm(key, value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1051 | {label} | ReasonInput  | {required} | {tabForm[key] \|\| ""} → {(value) => updateForm(key, value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1069 | (dynamic/unlabelled; name=none) | input {type} | {required} | {tabForm[key] ?? ""} → {(event) => updateForm(key, event.target.value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1332 | (dynamic/unlabelled; name=none) | input "checkbox" | true | { tabForm.minimumSpendAckVersion === minimumSpendPolicy.version } → {(event) => updateForm( "minimumSpendAckVersion", event.target.checked ? minimumSpendPolicy.version : "", ) } |
| src/mera/workspace/OrganizationWorkspace.tsx:1456 | "Organization" | ChoiceField  | not declared | {organizationId} → {(value) => setOrganizationId(value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1469 | "Branch" | ChoiceField  | not declared | {branchId} → {(value) => setBranchId(value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:1992 | Resolution reason | input  | true | {abandonReason} → {(event) => setAbandonReason(event.target.value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:2005 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {abandonConfirmed} → {(event) => setAbandonConfirmed(event.target.checked) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2636 | (dynamic/unlabelled; name=none) | input  | { key !== "parentCategory" && key !== "size" } | {productEdit[key] \|\| ""} → {(event) => setProductEdit({ ...productEdit, [key]: event.target.value \|\| (key === "parentCategory" ? null : ""), }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2652 | "Menu category" | ChoiceField  | not declared | {productEdit.categoryId \|\| ""} → {(value) => { const category = categories.find( (row) => row.id === value, ); setProductEdit({ ...productEdit, categoryId: value \|\| null, ...(category ? { category: category.name, categoryPath: categoryPath( category, categories, ), } : {}), }); }} |
| src/mera/workspace/OrganizationWorkspace.tsx:2688 | Category | input  | true | {productEdit.category \|\| ""} → {(event) => setProductEdit({ ...productEdit, category: event.target.value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2701 | Parent category | input  | not declared | {productEdit.parentCategory \|\| ""} → {(event) => setProductEdit({ ...productEdit, parentCategory: event.target.value \|\| null, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2714 | "Low-stock alert threshold" | Stepper  | not declared | {productEdit.lowStockThreshold ?? 5} → {(value) => setProductEdit({ ...productEdit, lowStockThreshold: value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2726 | "Price in naira" | MoneyInput  | true | { productEdit.priceDraft ?? String(productEdit.price / 100) } → {(value) => setProductEdit({ ...productEdit, priceDraft: value, price: Math.round(Number(value) * 100), }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2741 | "Stock mode" | ChoiceField  | not declared | {productEdit.stockMode} → {(value) => setProductEdit({ ...productEdit, stockMode: value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2757 | "Preparation station" | ChoiceField  | not declared | {productEdit.station} → {(value) => setProductEdit({ ...productEdit, station: value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2770 | "Available" | ChoiceField  | not declared | {String(productEdit.available)} → {(value) => setProductEdit({ ...productEdit, available: value === "true", }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2785 | Description | textarea  | not declared | {productEdit.description} → {(event) => setProductEdit({ ...productEdit, description: event.target.value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2874 | Allergens (comma separated) | input  | not declared | { productEdit.allergensText ?? (productEdit.allergens \|\| []).join(", ") } → {(e) => setProductEdit({ ...productEdit, allergensText: e.target.value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:2889 | Dietary labels (comma separated) | input  | not declared | { productEdit.dietaryText ?? (productEdit.dietary \|\| []).join(", ") } → {(e) => setProductEdit({ ...productEdit, dietaryText: e.target.value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3066 | Find orders | input "search" | not declared | {orderFilters.query} → {(event) => setOrderFilters({ ...orderFilters, query: event.target.value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3078 | "Show orders" | ChoiceField  | not declared | {orderFilters.serviceQueue} → {(value) => setOrderFilters({ ...orderFilters, serviceQueue: value, unassigned: false, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3099 | "Order status" | ChoiceField  | not declared | {orderFilters.status} → {(value) => setOrderFilters({ ...orderFilters, status: value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3125 | "Order channel" | ChoiceField  | not declared | {orderFilters.source} → {(value) => setOrderFilters({ ...orderFilters, source: value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3149 | "Payment state" | ChoiceField  | not declared | {orderFilters.payment} → {(value) => setOrderFilters({ ...orderFilters, payment: value, }) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3687 | "Table" | ChoiceField  | true | {tabForm.tableId \|\| ""} → {(value) => updateForm("tableId", value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:3956 | "Order" | Combobox  | true | {tabForm.orderId \|\| ""} → {(value) => setTabForm((current) => ({ ...current, orderId: value, amount: "", cashTender: "", })) } |
| src/mera/workspace/OrganizationWorkspace.tsx:3987 | "Payment origin" | Segmented  | not declared | {tabForm.method \|\| "cash"} → {(value) => setTabForm((current) => ({ ...current, method: value, cashTender: "", })) } |
| src/mera/workspace/OrganizationWorkspace.tsx:4047 | "Refund order" | Combobox  | true | {tabForm.refundOrder \|\| ""} → {(value) => updateForm("refundOrder", value)} |
| src/mera/workspace/OrganizationWorkspace.tsx:4063 | "Refund payout method" | Segmented  | true | {tabForm.refundMethod \|\| ""} → {(value) => updateForm("refundMethod", value) } |
| src/mera/workspace/OwnerSetup.tsx:282 | {<>Setup step</>} | ChoiceField  | not declared | {step} → {(nextValue) => void move(Number(nextValue))} |
| src/mera/workspace/PaymentEntry.tsx:29 | "Amount received (naira)" | MoneyInput  | true | {amount} → {(value) => onChange({ amount: value })} |
| src/mera/workspace/PaymentEntry.tsx:39 | "Quick amount" | Chips  | not declared | "" → {(value) => { const selected = Number(value); onChange({ amount: String(due / 100), cashTender: cash ? String(selected / 100) : "", }); }} |
| src/mera/workspace/PaymentEntry.tsx:73 | "Cash handed over (naira, optional)" | MoneyInput  | not declared | {tender} → {(value) => onChange({ cashTender: value })} |
| src/mera/workspace/PolicyEditor.tsx:44 | {label} | Stepper  | true | {Number(draft.includedBranches)} → {(value) => setDraft({ ...draft, includedBranches: String(value) }) } |
| src/mera/workspace/PolicyEditor.tsx:55 | {label} | MoneyInput  | {!optional} | {draft[key]} → {(value) => setDraft({ ...draft, [key]: value })} |
| src/mera/workspace/PolicyEditor.tsx:65 | (dynamic/unlabelled; name=none) | input "number" | {!optional} | {draft[key]} → {(event) => setDraft({ ...draft, [key]: event.target.value }) } |
| src/mera/workspace/PolicyEditor.tsx:82 | {label} | Segmented  | not declared | {draft[key]} → {(value) => setDraft({ ...draft, [key]: value })} |
| src/mera/workspace/PosOrderContext.tsx:37 | "Fulfillment" | Segmented  | true | {unavailableTableSelection ? "" : draft.fulfillment} → {(value) => onChange({ fulfillment: value, visitId: undefined }) } |
| src/mera/workspace/PosOrderContext.tsx:55 | "Open table visit" | Combobox  | true | {draft.visitId \|\| ""} → {(value) => onChange({ visitId: value })} |
| src/mera/workspace/PosOrderContext.tsx:96 | Customer name (optional) | input  | not declared | {draft.displayName} → {(event) => onChange({ displayName: event.target.value }) } |
| src/mera/workspace/PosOrderContext.tsx:108 | Order note | input  | not declared | {draft.note} → {(event) => onChange({ note: event.target.value })} |
| src/mera/workspace/PricingPolicy.tsx:60 | "Enable this branch order pricing policy" | Switch  | not declared | {draft.enabled} → {(enabled) => setDraft({ ...draft, enabled })} |
| src/mera/workspace/PricingPolicy.tsx:76 | {`Include ${key === "serviceCharge" ? "service charge" : key}`} | Switch  | not declared | {!!row} → {(checked) => { if (key === "discount") setDiscountAmount("0"); setDraft({ ...draft, [key]: checked ? key === "discount" ? { label: "Discount", type: "fixed", value: 0 } : key === "tax" ? { label: "Tax", basisPoints: 0, basis: "net_items", } : { label: "Service charge", basisPoints: 0 } : null, }); }} |
| src/mera/workspace/PricingPolicy.tsx:101 | Customer-facing label | input  | true | {row.label} → {(event) => setDraft({ ...draft, [key]: { ...row, label: event.target.value }, }) } |
| src/mera/workspace/PricingPolicy.tsx:115 | "Discount type" | Segmented  | not declared | {row.type} → {(type) => { setDiscountAmount("0"); setDraft({ ...draft, discount: { ...row, type, value: 0 }, }); }} |
| src/mera/workspace/PricingPolicy.tsx:131 | "Discount amount (naira)" | MoneyInput  | true | {discountAmount} → {(value) => { setDiscountAmount(value); setDraft({ ...draft, discount: { ...row, value: Math.round(Number(value) * 100), }, }); }} |
| src/mera/workspace/PricingPolicy.tsx:151 | (dynamic/unlabelled; name=none) | input "number" | true | {row.value / 100} → {(event) => setDraft({ ...draft, discount: { ...row, value: Math.round( Number(event.target.value) * 100, ), }, }) } |
| src/mera/workspace/PricingPolicy.tsx:178 | (%) | input "number" | true | {row.basisPoints / 100} → {(event) => setDraft({ ...draft, [key]: { ...row, basisPoints: Math.round( Number(event.target.value) * 100, ), }, }) } |
| src/mera/workspace/PricingPolicy.tsx:200 | "Tax calculation basis" | Segmented  | not declared | {row.basis} → {(basis) => setDraft({ ...draft, tax: { ...row, basis } }) } |
| src/mera/workspace/PricingPolicy.tsx:222 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {approved} → {(event) => setApproved(event.target.checked)} |
| src/mera/workspace/PrintStudio.tsx:864 | Business heading | input  | true | {templates.receipt.businessName} → {(e) => editTemplates({ ...templates, receipt: { ...templates.receipt, businessName: e.target.value, }, }) } |
| src/mera/workspace/PrintStudio.tsx:879 | "Receipt roll" | Segmented  | not declared | {String(templates.receipt.paperWidth)} → {(value) => editTemplates({ ...templates, receipt: { ...templates.receipt, paperWidth: Number(value), }, }) } |
| src/mera/workspace/PrintStudio.tsx:898 | Footer | textarea  | not declared | {templates.receipt.footer} → {(e) => editTemplates({ ...templates, receipt: { ...templates.receipt, footer: e.target.value, }, }) } |
| src/mera/workspace/PrintStudio.tsx:912 | "Show staff" | Switch  | not declared | {templates.receipt.showStaff} → {(value) => editTemplates({ ...templates, receipt: { ...templates.receipt, showStaff: value }, }) } |
| src/mera/workspace/PrintStudio.tsx:926 | Sticker (mm) | input "number" | true | {templates.label[key]} → {(e) => editTemplates({ ...templates, label: { ...templates.label, [key]: Number(e.target.value), }, }) } |
| src/mera/workspace/PrintStudio.tsx:1010 | "Reason for reprint" | ReasonInput  | not declared | {reason} → {setReason} |
| src/mera/workspace/PrivateVisitAccess.tsx:184 | Joining-code replacement reason | input  | true | {reason} → {(event) => setReason(event.target.value)} |
| src/mera/workspace/QrCodes.tsx:252 | {<>Menu destination</>} | ChoiceField  | not declared | {kind} → {(nextValue) => setKind(nextValue)} |
| src/mera/workspace/QrCodes.tsx:264 | {<>Table</>} | ChoiceField  | true | {tableId} → {(nextValue) => setTableId(nextValue)} |
| src/mera/workspace/Reconciliation.tsx:310 | Simulator transaction ID | input  | true | {draft.transactionId} → {(event) => setDraft({ ...draft, transactionId: event.target.value, }) } |
| src/mera/workspace/Reconciliation.tsx:323 | "Simulator order" | Combobox  | true | {draft.orderId} → {(value) => setDraft({ ...draft, orderId: value }) } |
| src/mera/workspace/Reconciliation.tsx:347 | "Event sequence" | Stepper  | true | {draft.sequence} → {(value) => setDraft({ ...draft, sequence: value }) } |
| src/mera/workspace/Reconciliation.tsx:356 | "Observation type" | Segmented  | not declared | {draft.type} → {(value) => setDraft({ ...draft, type: value })} |
| src/mera/workspace/Reconciliation.tsx:366 | "Observed amount (naira)" | MoneyInput  | true | {String(draft.amount)} → {(value) => setDraft({ ...draft, amount: value }) } |
| src/mera/workspace/RefundRequests.tsx:138 | "Order" | Combobox  | true | {orderId} → {(value) => { setOrder(value); setSelectedLines([]); setAmount(""); }} |
| src/mera/workspace/RefundRequests.tsx:161 | "Requested return (₦)" | MoneyInput  | true | {amount} → {(value) => { setAmount(value); setSelectedLines([]); }} |
| src/mera/workspace/RefundRequests.tsx:209 | × · | input "checkbox" | not declared | {selectedLines.includes(line.orderLineId)} → {(event) => { const chosen = event.target.checked ? [...selectedLines, line.orderLineId] : selectedLines.filter( (id) => id !== line.orderLineId, ); setSelectedLines(chosen); setAmount( ( refundLines .filter((item: any) => chosen.includes(item.orderLineId), ) .reduce( (sum: number, item: any) => sum + item.total, 0, ) / 100 ).toFixed(2), ); }} |
| src/mera/workspace/RefundRequests.tsx:238 | "Reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/RefundRequests.tsx:294 | "Review reason" | ReasonInput  | not declared | {reason} → {setReason} |
| src/mera/workspace/RefundRequests.tsx:322 | "Actual completed return method" | Segmented  | not declared | {method} → {setMethod} |
| src/mera/workspace/RefundRequests.tsx:335 | Return reference | input  | not declared | {reference} → {(e) => setReference(e.target.value)} |
| src/mera/workspace/RefundRequests.tsx:342 | Money has already been returned; record it now | input "checkbox" | not declared | {confirmed} → {(e) => setConfirmed(e.target.checked)} |
| src/mera/workspace/ReportExplorer.tsx:180 | "Choose a trading day" | Chips  | not declared | {dayPreset} → {chooseDay} |
| src/mera/workspace/ReportExplorer.tsx:198 | Business date | input "date" | true | {date} → {(event) => { setDate(event.target.value); setDayPreset("custom"); }} |
| src/mera/workspace/ReservationDesk.tsx:101 | Search reservation names | input "search" | not declared | {query} → {(event) => setQuery(event.target.value)} |
| src/mera/workspace/ReservationPolicy.tsx:39 | {label} | Stepper  | true | {Number(draft[key])} → {(value) => setDraft({ ...draft, [key]: value })} |
| src/mera/workspace/ReservationPolicy.tsx:50 | (dynamic/unlabelled; name=none) | input "number" | {!nullable} | {draft[key] === null ? "" : String(draft[key])} → {(event) => setDraft({ ...draft, [key]: event.target.value === "" && nullable ? null : Number(event.target.value), }) } |
| src/mera/workspace/ReservationPolicy.tsx:101 | "Apply this reservation timing policy" | Switch  | not declared | {draft.enabled} → {(enabled) => setDraft({ ...draft, enabled })} |
| src/mera/workspace/ReservationPolicy.tsx:147 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {approved} → {(event) => setApproved(event.target.checked)} |
| src/mera/workspace/ReservationRequest.tsx:441 | "Reason for stopping" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/ReservationRequest.tsx:456 | I want to stop this unconfirmed request. | input "checkbox" | not declared | {confirm} → {(e) => setConfirm(e.target.checked)} |
| src/mera/workspace/ReservationRequest.tsx:516 | {label} | DateTimePicker  | true | {draft[key]} → {(value) => setDraft((previous) => ({ ...previous, [key]: value })) } |
| src/mera/workspace/ReservationRequest.tsx:526 | {label} | Stepper  | true | {Number(draft.partySize)} → {(value) => setDraft((previous) => ({ ...previous, partySize: String(value), })) } |
| src/mera/workspace/ReservationRequest.tsx:543 | (dynamic/unlabelled; name=none) | input {type} | true | {draft[key]} → {(e) => setDraft({ ...draft, [key]: e.target.value }) } |
| src/mera/workspace/ReservationRequest.tsx:561 | "Quick party size" | Chips  | not declared | {Number(draft.partySize) >= 9 ? "9+" : draft.partySize} → {(value) => setDraft((previous) => ({ ...previous, partySize: value === "9+" ? "9" : value, })) } |
| src/mera/workspace/ReservationRequest.tsx:578 | "Preferred table" | Combobox  | not declared | {draft.tableId} → {(tableId) => setDraft((previous) => ({ ...previous, tableId })) } |
| src/mera/workspace/ReservationRequest.tsx:609 | Notes (optional) | textarea  | not declared | {draft.notes} → {(e) => setDraft({ ...draft, notes: e.target.value }) } |
| src/mera/workspace/ReservationRequest.tsx:631 | The customer reviewed and accepted these disclosed minimum-spend terms. | input "checkbox" | true | {ack === minimum.version} → {(e) => setAck(e.target.checked ? minimum.version : "") } |
| src/mera/workspace/ReservationSettlement.tsx:72 | "Deposit already received (naira)" | MoneyInput  | true | {String(form.amount \|\| "")} → {(value) => setForm({ ...form, amount: value })} |
| src/mera/workspace/ReservationSettlement.tsx:79 | "Deposit method" | Segmented  | not declared | {form.method \|\| "cash"} → {(value) => setForm({ ...form, method: value })} |
| src/mera/workspace/ReservationSettlement.tsx:94 | Verified reference | input  | {form.method === "external_transfer"} | {form.reference \|\| ""} → {(e) => setForm({ ...form, reference: e.target.value })} |
| src/mera/workspace/ReservationSettlement.tsx:119 | "Seat at table" | Combobox  | true | {form.tableId \|\| ""} → {(value) => setForm({ ...form, tableId: value })} |
| src/mera/workspace/RoleManager.tsx:469 | Staff email | input "email" | true | {email} → {(e) => setEmail(e.target.value)} |
| src/mera/workspace/RoleManager.tsx:481 | {templateLabels[row.id] \|\| row.name} | input "radio" | true | {row.id} → {() => setRole(row.id)} |
| src/mera/workspace/RoleManager.tsx:552 | Development invitation token | input  | not declared | {invitation.developmentToken} → (form serialization or parent) |
| src/mera/workspace/RoleManager.tsx:861 | Role name | input  | true | {edit.name} → {(e) => changedEdit({ ...edit, name: e.target.value }) } |
| src/mera/workspace/RoleManager.tsx:924 | {permissionLabel(permission)} | Switch  | not declared | {edit.permissions.includes(permission)} → {(checked) => changedEdit({ ...edit, permissions: checked ? [...edit.permissions, permission] : edit.permissions.filter( (value: string) => value !== permission, ), }) } |
| src/mera/workspace/RoleManager.tsx:953 | "Role active" | Switch  | not declared | {edit.active} → {(active) => changedEdit({ ...edit, active })} |
| src/mera/workspace/SharedMenus.tsx:94 | New shared menu name | input  | true | {name} → {(event) => setName(event.target.value)} |
| src/mera/workspace/SharedMenus.tsx:114 | {<>Shared template</>} | ChoiceField  | not declared | {selected} → {(nextValue) => { setSelected(nextValue); setOverrides({}); }} |
| src/mera/workspace/SharedMenus.tsx:190 | {`Override price for ${item.name} (naira)`} | MoneyInput  | not declared | {overrides[item.code]?.price ?? ""} → {(value) => { const current = { ...(overrides[item.code] \|\| {}) }; if (value === "") delete current.price; else current.price = value; setOverrides({ ...overrides, [item.code]: current }); }} |
| src/mera/workspace/SharedMenus.tsx:202 | {<>Availability for {item.name}</>} | ChoiceField  | not declared | { overrides[item.code]?.available === undefined ? "inherit" : String(overrides[item.code].available) } → {(nextValue) => { const current = { ...(overrides[item.code] \|\| {}) }; if (nextValue === "inherit") delete current.available; else current.available = nextValue === "true"; setOverrides({ ...overrides, [item.code]: current }); }} |
| src/mera/workspace/SharedMenus.tsx:220 | {<>Destination category for {item.name}</>} | ChoiceField  | not declared | {overrides[item.code]?.categoryId \|\| "inherit"} → {(nextValue) => { const current = { ...(overrides[item.code] \|\| {}) }; if (nextValue === "inherit") delete current.categoryId; else { current.categoryId = nextValue; delete current.category; } setOverrides({ ...overrides, [item.code]: current }); }} |
| src/mera/workspace/SharedMenus.tsx:248 | Override category for | input  | not declared | {overrides[item.code]?.category \|\| ""} → {(event) => { const current = { ...(overrides[item.code] \|\| {}) }; if (event.target.value.trim()) current.category = event.target.value; else delete current.category; setOverrides({ ...overrides, [item.code]: current, }); }} |
| src/mera/workspace/ShiftActions.tsx:215 | "Variance approval reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/ShiftActions.tsx:272 | "Receiving staff" | Combobox  | true | {toUserId} → {setToUserId} |
| src/mera/workspace/ShiftActions.tsx:283 | "Handover reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/ShiftOperation.tsx:379 | "Reason for stopping" | ReasonInput  | not declared | {stopReason} → {setStopReason} |
| src/mera/workspace/ShiftOperation.tsx:393 | I want to stop this unconfirmed shift operation. | input "checkbox" | not declared | {confirmed} → {(e) => setConfirmed(e.target.checked)} |
| src/mera/workspace/ShiftOperation.tsx:453 | { opens.length === 1 ? "Counted cash (naira)" : "Opening float (naira)" } | CashCounter  | true | {cash} → {setCash} |
| src/mera/workspace/ShiftOperation.tsx:465 | "Variance explanation" | ReasonInput  | not declared | {reason} → {setReason} |
| src/mera/workspace/ShiftWorkspace.tsx:62 | "Show shifts" | Chips  | not declared | {queue} → {(v) => setQueue(v as Queue)} |
| src/mera/workspace/StaffOrderItems.tsx:60 | {"Quantity of " + product.name} | Stepper  | not declared | {line?.quantity \|\| 0} → {(value) => update(product.id, { quantity: value })} |
| src/mera/workspace/StaffOrderItems.tsx:116 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {(Array.isArray(line.modifiers) ? line.modifiers : [] ).includes(option.id)} → {(event) => { const modifiers = ( Array.isArray(line.modifiers) ? line.modifiers : [] ).filter((id: string) => id !== option.id); if (event.target.checked) modifiers.push(option.id); update(product.id, { modifiers }); }} |
| src/mera/workspace/StaffPos.tsx:94 | "Search counter menu" | input "search" | not declared | {query} → {(e) => setQuery(e.target.value)} |
| src/mera/workspace/StaffPos.tsx:120 | {<>Menu category</>} | ChoiceField  | not declared | {category} → {(nextValue) => setCategory(nextValue)} |
| src/mera/workspace/StockAdjustment.tsx:199 | {`Stock target for ${product.name}`} | Combobox  | not declared | {variantId} → {(v) => { setVariant(v); setChange(1); }} |
| src/mera/workspace/StockAdjustment.tsx:218 | "Movement type" | Segmented  | not declared | {type} → {(v) => { setType(v); setChange(1); setReason(""); }} |
| src/mera/workspace/StockAdjustment.tsx:234 | {`Stock change for ${product.name}`} | Stepper  | true | {change} → {setChange} |
| src/mera/workspace/StockAdjustment.tsx:253 | "Quick stock change" | Chips  | not declared | {String(delta)} → {(v) => { const n = Number(v); setChange(type === "correction" ? n : Math.abs(n)); }} |
| src/mera/workspace/StockAdjustment.tsx:273 | {`Stock reason for ${product.name}`} | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/StockMovements.tsx:69 | "Stock product" | Combobox  | not declared | {productId} → {setProduct} |
| src/mera/workspace/SupportCases.tsx:252 | Support subject | input  | true | → (form serialization or parent) |
| src/mera/workspace/SupportCases.tsx:254 | {<>Support topic</>} | ChoiceField  | not declared | → (form serialization or parent) |
| src/mera/workspace/SupportCases.tsx:260 | {<>Related branch</>} | ChoiceField  | not declared | → (form serialization or parent) |
| src/mera/workspace/SupportCases.tsx:274 | Support message | textarea  | true | → (form serialization or parent) |
| src/mera/workspace/TableEditor.tsx:113 | (dynamic/unlabelled; name=none) | input  | true | {draft[key]} → {(e) => setDraft({ ...draft, [key]: e.target.value })} |
| src/mera/workspace/TableEditor.tsx:120 | "Seats" | Stepper  | true | {draft.capacity} → {(capacity) => setDraft({ ...draft, capacity })} |
| src/mera/workspace/TableEditor.tsx:131 | (dynamic/unlabelled; name=none) | input "number" | true | {draft[key]} → {(e) => setDraft({ ...draft, [key]: Number(e.target.value) }) } |
| src/mera/workspace/TableEditor.tsx:175 | {<>Table service status</>} | ChoiceField  | not declared | {status} → {(nextValue) => setStatus(nextValue)} |
| src/mera/workspace/TableEditor.tsx:186 | Table status reason | input  | true | {reason} → {(event) => setReason(event.target.value)} |
| src/mera/workspace/TableServiceView.tsx:107 | {<>Show visits</>} | ChoiceField  | not declared | {view} → {(nextValue) => setView(nextValue)} |
| src/mera/workspace/Tickets.tsx:467 | "Preparation station" | Chips  | not declared | {station} → {setStation} |
| src/mera/workspace/Tickets.tsx:484 | "Show tickets" | Segmented  | not declared | {view} → {setView} |
| src/mera/workspace/Tickets.tsx:497 | "Preparation status" | Chips  | not declared | {phoneStatus} → {setPhoneStatus} |
| src/mera/workspace/TimeWindows.tsx:61 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {window.days.includes(number)} → {(event) => update(index, { days: event.target.checked ? [...window.days, number].sort() : window.days.filter( (value: number) => value !== number, ), }) } |
| src/mera/workspace/TimeWindows.tsx:82 | Window starts | input "time" | true | {window.start} → {(event) => update(index, { start: event.target.value }) } |
| src/mera/workspace/TimeWindows.tsx:93 | Window ends | input "time" | true | {window.end} → {(event) => update(index, { end: event.target.value })} |
| src/mera/workspace/VariantsEditor.tsx:29 | Size name | input  | true | {variant.name} → {(event) => update(variant.id, { name: event.target.value }) } |
| src/mera/workspace/VariantsEditor.tsx:38 | "Size price (naira)" | MinorMoneyInput  | true | {variant.price} → {(value) => update(variant.id, { price: value, }) } |
| src/mera/workspace/VariantsEditor.tsx:49 | "Size low-stock alert threshold" | Stepper  | true | {variant.lowStockThreshold ?? 5} → {(value) => update(variant.id, { lowStockThreshold: value }) } |
| src/mera/workspace/VisitMinimumSpend.tsx:252 | Minimum-spend waiver reason | input  | true | {reason} → {(event) => setReason(event.target.value)} |
| src/mera/workspace/VisitMinimumSpend.tsx:261 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {approved} → {(event) => setApproved(event.target.checked) } |
| src/mera/workspace/VisitTables.tsx:182 | (dynamic/unlabelled; name=none) | input "checkbox" | not declared | {selectedHere} → {(event) => { const next = event.target.checked ? [...selected, table.id] : selected.filter((id) => id !== table.id); setSelected(next); if (!next.includes(primary)) setPrimary(next[0] \|\| ""); }} |
| src/mera/workspace/VisitTables.tsx:219 | {<>Primary table</>} | ChoiceField  | true | {primary} → {(nextValue) => setPrimary(nextValue)} |
| src/mera/workspace/VisitTables.tsx:237 | Table change reason | input  | true | {reason} → {(event) => setReason(event.target.value)} |
| src/mera/workspace/Waitlist.tsx:265 | "Show waitlist" | Segmented  | not declared | {view} → {setView} |
| src/mera/workspace/Waitlist.tsx:430 | Party name | input  | true | {draft.displayName} → {(event) => setDraft({ ...draft, displayName: event.target.value }) } |
| src/mera/workspace/Waitlist.tsx:440 | "Party size" | Stepper  | true | {draft.partySize} → {(partySize) => setDraft({ ...draft, partySize })} |
| src/mera/workspace/Waitlist.tsx:448 | "Quick party size" | Chips  | not declared | {draft.partySize > 8 ? "9+" : String(draft.partySize)} → {(v) => setDraft({ ...draft, partySize: v === "9+" ? 9 : Number(v), }) } |
| src/mera/workspace/Waitlist.tsx:468 | Contact | input  | not declared | {draft.contact} → {(event) => setDraft({ ...draft, contact: event.target.value }) } |
| src/mera/workspace/Waitlist.tsx:478 | Front desk note | textarea  | not declared | {draft.notes} → {(event) => setDraft({ ...draft, notes: event.target.value }) } |
| src/mera/workspace/WriteOff.tsx:94 | "Debt write-off amount (naira)" | MoneyInput  | true | {String(amount)} → {(value) => setAmount(value)} |
| src/mera/workspace/WriteOff.tsx:102 | "Debt write-off reason" | ReasonInput  | true | {reason} → {setReason} |
| src/mera/workspace/WriteOff.tsx:120 | (dynamic/unlabelled; name=none) | input "checkbox" | true | {approved} → {(event) => setApproved(event.target.checked)} |
