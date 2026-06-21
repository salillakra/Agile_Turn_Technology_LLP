-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "CrmClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CrmRequirementStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "crm_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "status" "CrmClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "account_owner_id" TEXT,
    "billing_email" TEXT,
    "billing_address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "expected_value" DECIMAL(12,2),
    "owner_id" TEXT,
    "converted_client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_requirements" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "fee_type" TEXT,
    "fee_amount" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'INR',
    "status" "CrmRequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "job_id" TEXT,
    "department" TEXT,
    "location" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_submissions" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "crm_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_closures" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fee_amount" DECIMAL(12,2),
    "revenue_amount" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'INR',
    "notes" TEXT,

    CONSTRAINT "crm_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_invoices" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "closure_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "CrmInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_converted_client_id_key" ON "crm_leads"("converted_client_id");

-- CreateIndex
CREATE INDEX "crm_leads_status_idx" ON "crm_leads"("status");

-- CreateIndex
CREATE INDEX "crm_leads_owner_id_idx" ON "crm_leads"("owner_id");

-- CreateIndex
CREATE INDEX "crm_clients_status_idx" ON "crm_clients"("status");

-- CreateIndex
CREATE INDEX "crm_clients_account_owner_id_idx" ON "crm_clients"("account_owner_id");

-- CreateIndex
CREATE INDEX "crm_contacts_client_id_idx" ON "crm_contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_requirements_job_id_key" ON "crm_requirements"("job_id");

-- CreateIndex
CREATE INDEX "crm_requirements_client_id_idx" ON "crm_requirements"("client_id");

-- CreateIndex
CREATE INDEX "crm_requirements_status_idx" ON "crm_requirements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "crm_submissions_application_id_key" ON "crm_submissions"("application_id");

-- CreateIndex
CREATE INDEX "crm_submissions_requirement_id_idx" ON "crm_submissions"("requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_closures_application_id_key" ON "crm_closures"("application_id");

-- CreateIndex
CREATE INDEX "crm_closures_client_id_idx" ON "crm_closures"("client_id");

-- CreateIndex
CREATE INDEX "crm_closures_requirement_id_idx" ON "crm_closures"("requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_invoices_closure_id_key" ON "crm_invoices"("closure_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_invoices_invoice_number_key" ON "crm_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "crm_invoices_client_id_idx" ON "crm_invoices"("client_id");

-- CreateIndex
CREATE INDEX "crm_invoices_status_idx" ON "crm_invoices"("status");

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_converted_client_id_fkey" FOREIGN KEY ("converted_client_id") REFERENCES "crm_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_clients" ADD CONSTRAINT "crm_clients_account_owner_id_fkey" FOREIGN KEY ("account_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_requirements" ADD CONSTRAINT "crm_requirements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_requirements" ADD CONSTRAINT "crm_requirements_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_requirements" ADD CONSTRAINT "crm_requirements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_submissions" ADD CONSTRAINT "crm_submissions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "crm_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_submissions" ADD CONSTRAINT "crm_submissions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_closures" ADD CONSTRAINT "crm_closures_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_closures" ADD CONSTRAINT "crm_closures_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "crm_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_closures" ADD CONSTRAINT "crm_closures_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "crm_closures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
