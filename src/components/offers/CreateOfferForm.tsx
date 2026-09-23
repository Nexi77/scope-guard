import { useMemo, useState } from "react";
import { CheckCircle2, Plus, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parsePlnAmount } from "@/lib/pln";

interface Customer {
  id: string;
  name: string;
}

interface CreateOfferFormProps {
  customers: Customer[];
  serverError?: string | null;
  created: boolean;
  createdCustomerId?: string | null;
}

type CustomerMode = "existing" | "new";
type Errors = Partial<Record<"customer" | "scope" | "amount" | "deadline", string>>;

const today = new Date().toISOString().slice(0, 10);

function CreateOfferForm({ customers, serverError, created, createdCustomerId }: CreateOfferFormProps) {
  const [customerMode, setCustomerMode] = useState<CustomerMode>(customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [baseScope, setBaseScope] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const matchingCustomer = useMemo(
    () => customers.find((customer) => customer.name.trim().toLowerCase() === customerName.trim().toLowerCase()),
    [customers, customerName],
  );

  function clearError(field: keyof Errors) {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function chooseMode(mode: CustomerMode) {
    setCustomerMode(mode);
    setConfirmDuplicate(false);
    setErrors((current) => ({ ...current, customer: undefined }));
  }

  function validate() {
    const next: Errors = {};
    const normalizedAmount = amount.trim();

    if (customerMode === "existing" && !customerId) {
      next.customer = "Choose an existing customer or add a new one.";
    }
    if (customerMode === "new" && !customerName.trim()) {
      next.customer = "Customer name is required.";
    }
    if (customerMode === "new" && matchingCustomer && !confirmDuplicate) {
      next.customer = "Choose whether to reuse the matching customer or create a separate record.";
    }
    if (!baseScope.trim()) next.scope = "Original scope is required.";
    if (parsePlnAmount(normalizedAmount) === null) {
      next.amount = "Enter a non-negative PLN amount with up to two decimal places.";
    }
    if (!deadline) {
      next.deadline = "Deadline is required.";
    } else if (deadline < today) {
      next.deadline = "Deadline cannot be before today.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) event.preventDefault();
  }

  if (created) {
    return (
      <section
        className="border-primary/30 bg-card max-w-xl rounded-xl border p-6 shadow-sm"
        aria-labelledby="offer-created-title"
      >
        <CheckCircle2 className="text-primary mb-4 size-8" aria-hidden="true" />
        <h2 id="offer-created-title" className="text-xl font-semibold">
          Offer created
        </h2>
        <p className="text-muted-foreground mt-2">The original scope is recorded and ready for future changes.</p>
        <div className="mt-6 flex flex-col items-start gap-4">
          {createdCustomerId ? (
            <a
              href={`/offers?customer=${encodeURIComponent(createdCustomerId)}`}
              className="text-primary focus-visible:ring-ring inline-flex text-sm font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              View this customer’s offers
            </a>
          ) : null}
          <Button asChild>
            <a href="/offers/new">
              <Plus aria-hidden="true" />
              Create another offer
            </a>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      method="POST"
      action="/api/offers"
      className="bg-card max-w-2xl space-y-6 rounded-xl border p-5 shadow-sm sm:p-6"
      noValidate
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="customer_id" value={customerMode === "existing" ? customerId : ""} />
      <input
        type="hidden"
        name="confirm_duplicate"
        value={customerMode === "new" && confirmDuplicate ? "true" : "false"}
      />

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Customer</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant={customerMode === "existing" ? "default" : "outline"}
            onClick={() => {
              chooseMode("existing");
            }}
          >
            <Users aria-hidden="true" />
            Use existing customer
          </Button>
          <Button
            type="button"
            variant={customerMode === "new" ? "default" : "outline"}
            onClick={() => {
              chooseMode("new");
            }}
          >
            <UserPlus aria-hidden="true" />
            Add new customer
          </Button>
        </div>

        {customerMode === "existing" ? (
          <Field id="customer-id" label="Existing customer" error={errors.customer}>
            {(controlProps) => (
              <Select
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  clearError("customer");
                }}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={customers.length ? "Select a customer" : "No customers yet"} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : (
          <>
            <Field id="customer-name" label="Customer name" error={errors.customer}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="customer_name"
                  value={customerName}
                  onChange={(event) => {
                    setCustomerName(event.target.value);
                    setConfirmDuplicate(false);
                    clearError("customer");
                  }}
                  autoComplete="organization"
                />
              )}
            </Field>
            {matchingCustomer ? (
              <div className="border-primary/30 bg-secondary rounded-md border p-4 text-sm" role="status">
                <p className="font-medium">A customer named “{matchingCustomer.name}” already exists.</p>
                <p className="text-muted-foreground mt-1">Choose how to use this name before creating the offer.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCustomerId(matchingCustomer.id);
                      chooseMode("existing");
                    }}
                  >
                    Reuse existing customer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={confirmDuplicate ? "default" : "outline"}
                    onClick={() => {
                      setConfirmDuplicate(true);
                      clearError("customer");
                    }}
                  >
                    Create a separate customer
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </fieldset>

      <Field id="base-scope" label="Original scope" error={errors.scope}>
        {(controlProps) => (
          <Textarea
            {...controlProps}
            name="base_scope"
            value={baseScope}
            onChange={(event) => {
              setBaseScope(event.target.value);
              clearError("scope");
            }}
            rows={5}
          />
        )}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="base-amount" label="Price (PLN)" hint="For example, 1,250.00" error={errors.amount}>
          {(controlProps) => (
            <Input
              {...controlProps}
              name="base_amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                clearError("amount");
              }}
              inputMode="decimal"
              placeholder="0.00"
            />
          )}
        </Field>
        <Field id="base-deadline" label="Deadline" error={errors.deadline}>
          {(controlProps) => (
            <Input
              {...controlProps}
              name="base_deadline"
              type="date"
              value={deadline}
              min={today}
              onChange={(event) => {
                setDeadline(event.target.value);
                clearError("deadline");
              }}
            />
          )}
        </Field>
      </div>

      {serverError ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Create offer
      </Button>
    </form>
  );
}

export default CreateOfferForm;
