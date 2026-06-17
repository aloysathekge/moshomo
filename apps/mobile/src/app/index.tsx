import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { moshomoApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type Membership = { company_id: string; role: 'admin' | 'manager' | 'employee' };
type Company = { id: string; name: string; slug: string };
type Department = { id: string; company_id: string; name: string };
type Field = { name: string; label: string; optional?: boolean; keyboardType?: 'default' | 'email-address' };

const companyFields: Field[] = [
  { name: 'company_name', label: 'Company name' },
  { name: 'company_slug', label: 'Company slug' },
  { name: 'employee_number', label: 'Employee number' },
  { name: 'job_title', label: 'Job title', optional: true },
  { name: 'first_name', label: 'First name' },
  { name: 'last_name', label: 'Last name' },
];

const invitationFields: Field[] = [
  { name: 'first_name', label: 'First name' },
  { name: 'last_name', label: 'Last name' },
  { name: 'email', label: 'Email', keyboardType: 'email-address' },
  { name: 'employee_number', label: 'Employee number' },
  { name: 'job_title', label: 'Job title', optional: true },
  { name: 'employment_type', label: 'Employment type', optional: true },
];

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership>();
  const [company, setCompany] = useState<Company>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(true);

  const loadWorkspace = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setMembership(undefined);
    setCompany(undefined);
    setDepartments([]);
    if (!nextSession) {
      setLoading(false);
      return;
    }

    const { data: rows } = await supabase.from('company_memberships').select('company_id,role').eq('status', 'active').limit(1);
    const active = rows?.[0] as Membership | undefined;
    setMembership(active);
    if (active) {
      setShowSetup(!(await onboardingDismissed(active.company_id)));
      const [{ data: companies }, { data: items }] = await Promise.all([
        supabase.from('companies').select('id,name,slug').eq('id', active.company_id).limit(1),
        supabase.from('departments').select('id,company_id,name').eq('company_id', active.company_id).order('name'),
      ]);
      setCompany(companies?.[0] as Company | undefined);
      setDepartments((items ?? []) as Department[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => loadWorkspace(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadWorkspace(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [loadWorkspace]);

  async function authenticate(values: Record<string, string>) {
    try {
      setMessage(undefined);
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.fullName } } })
        : await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
      if (result.error) throw result.error;
      if (result.data.session) await loadWorkspace(result.data.session);
      else setMessage('Check your email, then sign in.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed.'); }
  }

  async function createCompany(values: Record<string, string>) {
    if (!session) return;
    try {
      setMessage(undefined);
      await moshomoApi('/companies', { method: 'POST', session, body: values });
      await loadWorkspace(session);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Company creation failed.'); }
  }

  async function createDepartment(values: Record<string, string>) {
    if (!session || !membership) return;
    try {
      const item = await moshomoApi<Department>(`/companies/${membership.company_id}/departments`, { method: 'POST', session, companyId: membership.company_id, body: values });
      setDepartments((current) => [...current, item]);
      setMessage('Department created.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Department creation failed.'); }
  }

  async function invite(values: Record<string, string>) {
    if (!session || !membership) return;
    try {
      await moshomoApi(`/companies/${membership.company_id}/invitations`, {
        method: 'POST',
        session,
        companyId: membership.company_id,
        body: { ...values, department_id: values.department_id || undefined },
      });
      setMessage(`Invitation sent to ${values.email}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invitation failed.'); }
  }

  async function skipSetup() {
    if (!membership) return;
    await setOnboardingDismissed(membership.company_id, true);
    setShowSetup(false);
    setMessage(undefined);
  }

  async function continueSetup() {
    if (!membership) return;
    await setOnboardingDismissed(membership.company_id, false);
    setShowSetup(true);
  }

  if (loading) return <Screen title="Loading Moshomo..." />;
  if (!session) return <Screen eyebrow={mode === 'signup' ? 'Create account' : 'Welcome back'} title={mode === 'signup' ? 'Start your company' : 'Sign in to Moshomo'}><SmartForm key={mode} fields={mode === 'signup' ? [{ name: 'fullName', label: 'Full name' }, { name: 'email', label: 'Work email', keyboardType: 'email-address' }, { name: 'password', label: 'Password' }] : [{ name: 'email', label: 'Work email', keyboardType: 'email-address' }, { name: 'password', label: 'Password' }]} secure="password" submit={mode === 'signup' ? 'Create account' : 'Sign in'} onSubmit={authenticate} /><Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}><Text style={styles.link}>{mode === 'signup' ? 'Already have an account? Sign in' : 'New to Moshomo? Create an account'}</Text></Pressable>{message && <Notice text={message} />}</Screen>;
  if (!membership) return <Screen eyebrow="Step 1 of 3" title="Create your company" subtitle="You become the founding admin and an employee at the same time."><SmartForm fields={companyFields} submit="Create company" onSubmit={createCompany} />{message && <Notice text={message} />}</Screen>;
  if (membership.role === 'employee') return <EmployeeWorkspace company={company} />;
  if (membership.role === 'manager') return <ManagerWorkspace company={company} />;
  if (!showSetup) return <Screen eyebrow="Workspace" title={`Welcome to ${company?.name ?? 'Moshomo'}`} subtitle="Your company is ready. You can add departments and invite employees whenever you are ready."><View style={styles.summary}><SummaryCard label="Departments" value={String(departments.length)} /><SummaryCard label="Leave" value="Coming soon" /><SummaryCard label="Shifts" value="Coming soon" /></View><Pressable style={styles.secondaryButton} onPress={() => void continueSetup()}><Text style={styles.secondaryButtonText}>Continue company setup</Text></Pressable><Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.link}>Sign out</Text></Pressable></Screen>;

  return <Screen eyebrow="Company setup" title="Build your workforce" subtitle="Create departments, then add employees and choose their role.">
    <Pressable style={styles.secondaryButton} onPress={() => void skipSetup()}><Text style={styles.secondaryButtonText}>Skip for now</Text></Pressable>
    <Text style={styles.step}>Step 2</Text>
    <Text style={styles.sectionTitle}>Departments</Text>
    <SmartForm fields={[{ name: 'name', label: 'Department name' }]} submit="Add department" onSubmit={createDepartment} />
    <View style={styles.chips}>{departments.map((item) => <Text key={item.id} style={styles.chip}>{item.name}</Text>)}</View>
    <Text style={styles.step}>Step 3</Text>
    <Text style={styles.sectionTitle}>Invite an employee</Text>
    <SmartForm
      fields={invitationFields}
      initialValues={{ role: 'employee', department_id: '' }}
      choices={[
        { name: 'role', label: 'Role', options: [{ label: 'Employee', value: 'employee' }, { label: 'Manager', value: 'manager' }, { label: 'Admin', value: 'admin' }] },
        { name: 'department_id', label: 'Department', options: [{ label: 'No department', value: '' }, ...departments.map((item) => ({ label: item.name, value: item.id }))] },
      ]}
      submit="Create employee and send invite"
      onSubmit={invite}
    />
    {message && <Notice text={message} />}
    <Text style={styles.company}>{company?.name} / {membership.role}</Text>
    <Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.link}>Sign out</Text></Pressable>
  </Screen>;
}

function Screen({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><Text style={styles.brand}>MOSHOMO</Text>{eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}<Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}{children}</ScrollView></SafeAreaView>;
}

function SmartForm({ fields, choices = [], initialValues = {}, secure, submit, onSubmit }: { fields: Field[]; choices?: { name: string; label: string; options: { label: string; value: string }[] }[]; initialValues?: Record<string, string>; secure?: string; submit: string; onSubmit: (values: Record<string, string>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [validation, setValidation] = useState<string>();

  function submitForm() {
    const missing = fields.find((field) => !field.optional && !values[field.name]?.trim());
    if (missing) {
      setValidation(`${missing.label} is required.`);
      return;
    }
    if (values.company_slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.company_slug)) {
      setValidation('Company slug can only use lowercase letters, numbers, and hyphens.');
      return;
    }
    setValidation(undefined);
    void onSubmit(values);
  }

  return <View style={styles.form}>
    {fields.map((field) => <View key={field.name}><Text style={styles.label}>{field.label}{field.optional ? ' (optional)' : ''}</Text><TextInput autoCapitalize={field.name.includes('email') || field.name.includes('slug') ? 'none' : 'sentences'} keyboardType={field.keyboardType} secureTextEntry={secure === field.name} style={styles.input} value={values[field.name] ?? ''} onChangeText={(value) => setValues((current) => ({ ...current, [field.name]: value }))} /></View>)}
    {choices.map((choice) => <View key={choice.name}><Text style={styles.label}>{choice.label}</Text><View style={styles.choiceRow}>{choice.options.map((option) => <Pressable key={option.value || 'none'} onPress={() => setValues((current) => ({ ...current, [choice.name]: option.value }))} style={[styles.choice, values[choice.name] === option.value && styles.choiceSelected]}><Text style={[styles.choiceText, values[choice.name] === option.value && styles.choiceTextSelected]}>{option.label}</Text></Pressable>)}</View></View>)}
    {validation && <Text style={styles.error}>{validation}</Text>}
    <Pressable style={styles.button} onPress={submitForm}><Text style={styles.buttonText}>{submit}</Text></Pressable>
  </View>;
}

function Notice({ text }: { text: string }) { return <Text style={styles.notice}>{text}</Text>; }
function SummaryCard({ label, value }: { label: string; value: string }) { return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function EmployeeWorkspace({ company }: { company?: Company }) { return <Screen eyebrow="Employee workspace" title={`Welcome to ${company?.name ?? 'Moshomo'}`} subtitle="View your shifts, manage your leave, and access your employee profile."><View style={styles.summary}><SummaryCard label="My shifts" value="Coming soon" /><SummaryCard label="My leave" value="Coming soon" /><SummaryCard label="My profile" value="Ready soon" /></View><Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.link}>Sign out</Text></Pressable></Screen>; }
function ManagerWorkspace({ company }: { company?: Company }) { return <Screen eyebrow="Manager workspace" title="Manage your team" subtitle={`Team operations for ${company?.name ?? 'your company'}.`}><View style={styles.summary}><SummaryCard label="Team" value="Coming soon" /><SummaryCard label="Leave requests" value="Coming soon" /><SummaryCard label="Shift coverage" value="Coming soon" /></View><Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.link}>Sign out</Text></Pressable></Screen>; }

function onboardingStorageKey(companyId: string) { return `moshomo_onboarding_dismissed:${companyId}`; }
async function onboardingDismissed(companyId: string) {
  const key = onboardingStorageKey(companyId);
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) === 'true';
  return (await SecureStore.getItemAsync(key)) === 'true';
}
async function setOnboardingDismissed(companyId: string, dismissed: boolean) {
  const key = onboardingStorageKey(companyId);
  if (Platform.OS === 'web') {
    if (dismissed) globalThis.localStorage?.setItem(key, 'true');
    else globalThis.localStorage?.removeItem(key);
    return;
  }
  if (dismissed) await SecureStore.setItemAsync(key, 'true');
  else await SecureStore.deleteItemAsync(key);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f4' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, gap: 16 },
  brand: { color: '#047857', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  eyebrow: { color: '#047857', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 8 },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '700', color: '#1c1917' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#57534e', marginBottom: 8 },
  step: { color: '#047857', fontSize: 14, fontWeight: '700', marginTop: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: '#1c1917', marginTop: -8 },
  form: { gap: 14, padding: 18, backgroundColor: '#fff', borderRadius: 20 },
  label: { color: '#44403c', fontSize: 14, fontWeight: '600', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: '#1c1917', backgroundColor: '#fff' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  choiceSelected: { borderColor: '#047857', backgroundColor: '#ecfdf5' },
  choiceText: { color: '#57534e', fontWeight: '600' },
  choiceTextSelected: { color: '#047857' },
  button: { borderRadius: 12, padding: 15, alignItems: 'center', backgroundColor: '#047857' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 12, padding: 15, alignItems: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { color: '#292524', fontWeight: '700' },
  link: { color: '#047857', fontWeight: '600', textAlign: 'center', padding: 10 },
  notice: { borderRadius: 12, padding: 14, backgroundColor: '#ecfdf5', color: '#065f46' },
  error: { color: '#be123c', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#e7e5e4', color: '#292524' },
  company: { color: '#57534e', textAlign: 'center', textTransform: 'capitalize' },
  summary: { gap: 12 },
  summaryCard: { borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 20, padding: 18, backgroundColor: '#fff' },
  summaryLabel: { color: '#78716c', fontSize: 14 },
  summaryValue: { color: '#1c1917', fontSize: 22, fontWeight: '700', marginTop: 8 },
});
