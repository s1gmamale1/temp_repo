import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastContainer, toast } from './Toast';

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a toast message when triggered', () => {
    render(<ToastContainer />);

    act(() => {
      toast('info', 'Test Toast', 'This is a message');
    });

    expect(screen.getByText('Test Toast')).toBeInTheDocument();
    expect(screen.getByText('This is a message')).toBeInTheDocument();
  });

  it('renders success toast with SYS_OK label', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('Operation completed');
    });

    expect(screen.getByText('Operation completed')).toBeInTheDocument();
    expect(screen.getByText('SYS_OK')).toBeInTheDocument();
  });

  it('renders error toast with ERR label', () => {
    render(<ToastContainer />);

    act(() => {
      toast.error('Something failed');
    });

    expect(screen.getByText('Something failed')).toBeInTheDocument();
    expect(screen.getByText('ERR')).toBeInTheDocument();
  });

  it('renders warning toast with WARN label', () => {
    render(<ToastContainer />);

    act(() => {
      toast.warning('Be careful');
    });

    expect(screen.getByText('Be careful')).toBeInTheDocument();
    expect(screen.getByText('WARN')).toBeInTheDocument();
  });

  it('renders info toast with INFO label', () => {
    render(<ToastContainer />);

    act(() => {
      toast.info('FYI');
    });

    expect(screen.getByText('FYI')).toBeInTheDocument();
    expect(screen.getByText('INFO')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('First');
      toast.error('Second');
    });

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders toast with optional message', () => {
    render(<ToastContainer />);

    act(() => {
      toast.info('Title Only');
    });

    expect(screen.getByText('Title Only')).toBeInTheDocument();
  });
});
