import { prisma } from '../utils/prisma';
import { generateLicenseKey, hashMachineFingerprint } from '../utils/crypto';
import { LICENSE_STATUS } from '../config/constants';
import type { LicenseStatus } from '@prisma/client';

export interface CreateLicenseInput {
  expiresAt: Date;
  maxEmailsPerDay: number;
  maxCampaignsPerDay: number;
  allowedIps?: string[];
  assignedEmail?: string;
  notes?: string;
  createdBy?: string;
}

export interface LicenseValidationResult {
  valid: boolean;
  error?: string;
  license?: {
    id: string;
    status: string;
    expiresAt: Date;
    maxEmailsPerDay: number;
    maxCampaignsPerDay: number;
  };
}

export const licenseService = {
  async create(input: CreateLicenseInput) {
    const licenseKey = generateLicenseKey();
    return prisma.license.create({
      data: {
        licenseKey,
        expiresAt: input.expiresAt,
        maxEmailsPerDay: input.maxEmailsPerDay,
        maxCampaignsPerDay: input.maxCampaignsPerDay,
        allowedIps: input.allowedIps ?? [],
        assignedEmail: input.assignedEmail,
        notes: input.notes,
        createdBy: input.createdBy,
        status: LICENSE_STATUS.ACTIVE as LicenseStatus,
      },
    });
  },

  async revoke(licenseId: string) {
    return prisma.license.update({
      where: { id: licenseId },
      data: { status: 'REVOKED' as LicenseStatus },
    });
  },

  async suspend(licenseId: string) {
    return prisma.license.update({
      where: { id: licenseId },
      data: { status: 'SUSPENDED' as LicenseStatus },
    });
  },

  async activate(licenseId: string) {
    return prisma.license.update({
      where: { id: licenseId },
      data: { status: 'ACTIVE' as LicenseStatus },
    });
  },

  async validateLicenseKey(
    licenseKey: string,
    clientIp: string,
    machineFingerprint?: string,
    email?: string
  ): Promise<LicenseValidationResult> {
    const license = await prisma.license.findUnique({
      where: { licenseKey: licenseKey.toUpperCase().replace(/\s/g, '') },
    });

    if (!license) {
      return { valid: false, error: 'Invalid license key' };
    }

    if (license.status === 'REVOKED') {
      return { valid: false, error: 'License has been revoked' };
    }

    if (license.status === 'SUSPENDED') {
      return { valid: false, error: 'License is suspended' };
    }

    if (license.expiresAt < new Date()) {
      await prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' as LicenseStatus },
      });
      return { valid: false, error: 'License has expired' };
    }

    if (license.allowedIps.length > 0 && !license.allowedIps.includes(clientIp)) {
      return { valid: false, error: 'IP address not allowed for this license' };
    }

    if (
      license.boundMachineId &&
      machineFingerprint &&
      hashMachineFingerprint(machineFingerprint) !== license.boundMachineId
    ) {
      return { valid: false, error: 'License is bound to another machine' };
    }

    if (license.assignedEmail && email && license.assignedEmail.toLowerCase() !== email.trim().toLowerCase()) {
      return { valid: false, error: 'This license is assigned to a different email address' };
    }

    return {
      valid: true,
      license: {
        id: license.id,
        status: license.status,
        expiresAt: license.expiresAt,
        maxEmailsPerDay: license.maxEmailsPerDay,
        maxCampaignsPerDay: license.maxCampaignsPerDay,
      },
    };
  },

  async bindToMachine(licenseId: string, machineFingerprint: string) {
    const boundMachineId = hashMachineFingerprint(machineFingerprint);
    return prisma.license.update({
      where: { id: licenseId },
      data: { boundMachineId },
    });
  },

  async getDailyUsage(userId: string, date: Date) {
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);

    const usage = await prisma.usageLog.findUnique({
      where: {
        userId_date: { userId, date: today },
      },
    });

    return {
      emailsSent: usage?.emailsSent ?? 0,
      campaignsRun: usage?.campaignsRun ?? 0,
    };
  },

  async incrementEmailUsage(userId: string, licenseId: string, count: number = 1) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.usageLog.upsert({
      where: {
        userId_date: { userId, date: today },
      },
      create: {
        userId,
        licenseId,
        date: today,
        emailsSent: count,
        campaignsRun: 0,
      },
      update: {
        emailsSent: { increment: count },
      },
    });
  },

  async incrementCampaignUsage(userId: string, licenseId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.usageLog.upsert({
      where: {
        userId_date: { userId, date: today },
      },
      create: {
        userId,
        licenseId,
        date: today,
        emailsSent: 0,
        campaignsRun: 1,
      },
      update: {
        campaignsRun: { increment: 1 },
      },
    });
  },

  async checkQuota(userId: string, licenseId: string): Promise<{
    canSendEmails: boolean;
    canCreateCampaign: boolean;
    emailsRemaining: number;
    campaignsRemaining: number;
    maxEmailsPerDay: number;
    maxCampaignsPerDay: number;
    emailsUsed: number;
    campaignsUsed: number;
  }> {
    const [license, usage] = await Promise.all([
      prisma.license.findUniqueOrThrow({ where: { id: licenseId } }),
      licenseService.getDailyUsage(userId, new Date()),
    ]);

    const maxEmails = license.maxEmailsPerDay;
    const maxCampaigns = license.maxCampaignsPerDay;
    const emailsRemaining = Math.max(0, maxEmails - usage.emailsSent);
    const campaignsRemaining = Math.max(0, maxCampaigns - usage.campaignsRun);

    return {
      canSendEmails: usage.emailsSent < maxEmails,
      canCreateCampaign: usage.campaignsRun < maxCampaigns,
      emailsRemaining,
      campaignsRemaining,
      maxEmailsPerDay: maxEmails,
      maxCampaignsPerDay: maxCampaigns,
      emailsUsed: usage.emailsSent,
      campaignsUsed: usage.campaignsRun,
    };
  },
};
