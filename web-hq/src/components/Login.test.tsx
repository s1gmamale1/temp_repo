import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the api module before importing the component
vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn(),
  },
  userSession: {
    setUser: vi.fn(),
    getUser: vi.fn(() => null),
  },
  wsClient: {
    setUserId: vi.fn(),
    connect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import Login from './Login';
import { authApi } from '../services/api';

describe('Login Component', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login form with username and password fields', () => {
    render(<Login onLogin={mockOnLogin} />);

    expect(screen.getByPlaceholderText('Enter identifier...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter key...')).toBeInTheDocument();
  });

  it('renders the username input as a text field', () => {
    render(<Login onLogin={mockOnLogin} />);

    const usernameInput = screen.getByPlaceholderText('Enter identifier...');
    expect(usernameInput).toHaveAttribute('type', 'text');
  });

  it('renders the password input as a password field', () => {
    render(<Login onLogin={mockOnLogin} />);

    const passwordInput = screen.getByPlaceholderText('Enter key...');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('has a submit button', () => {
    render(<Login onLogin={mockOnLogin} />);

    const submitBtn = screen.getByRole('button', { name: /authenticate/i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toHaveAttribute('type', 'submit');
  });

  it('shows error when submitting empty credentials', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={mockOnLogin} />);

    const submitBtn = screen.getByRole('button', { name: /authenticate/i });
    await user.click(submitBtn);

    expect(screen.getByText(/credentials required/i)).toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid credentials'));

    render(<Login onLogin={mockOnLogin} />);

    const usernameInput = screen.getByPlaceholderText('Enter identifier...');
    const passwordInput = screen.getByPlaceholderText('Enter key...');
    const submitBtn = screen.getByRole('button', { name: /authenticate/i });

    await user.type(usernameInput, 'wronguser');
    await user.type(passwordInput, 'wrongpass');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('displays the PROJECT-CLAW branding', () => {
    render(<Login onLogin={mockOnLogin} />);

    expect(screen.getByText('PROJECT-CLAW')).toBeInTheDocument();
  });

  it('displays Authentication Required header', () => {
    render(<Login onLogin={mockOnLogin} />);

    expect(screen.getByText('Authentication Required')).toBeInTheDocument();
  });
});
