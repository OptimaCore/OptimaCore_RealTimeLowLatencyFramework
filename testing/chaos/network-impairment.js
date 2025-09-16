#!/usr/bin/env node

/**
 * Network Impairment Tool for Chaos Testing
 * 
 * Wraps netem/toxiproxy to inject network issues like latency, packet loss, etc.
 */

const { execSync } = require('child_process');
const { Command } = require('commander');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Initialize command line interface
const program = new Command();
program
  .name('network-impairment')
  .description('Inject network impairments for chaos testing')
  .version('1.0.0')
  .option('-l, --latency <ms>', 'Add latency in milliseconds', '0')
  .option('-j, --jitter <ms>', 'Add jitter in milliseconds', '0')
  .option('--loss <percent>', 'Packet loss percentage', '0')
  .option('--duplicate <percent>', 'Packet duplication percentage', '0')
  .option('--corrupt <percent>', 'Packet corruption percentage', '0')
  .option('--bandwidth <rate>', 'Bandwidth limit (e.g., 1mbit, 100kbit)')
  .option('--duration <seconds>', 'Duration of impairment in seconds (0 = until stopped)', '0')
  .option('--interface <name>', 'Network interface to affect', 'eth0')
  .option('--reset', 'Reset all network impairments', false)
  .parse(process.argv);

const options = program.opts();

// Check for root/administrator privileges
function checkPrivileges() {
  if (process.platform === 'win32') {
    try {
      // On Windows, check if we're running as administrator
      execSync('net session >nul 2>&1');
      return true;
    } catch (e) {
      return false;
    }
  } else {
    // On Unix-like systems, check for root
    return process.getuid && process.getuid() === 0;
  }
}

// Apply network impairments using tc (Linux) or PowerShell (Windows)
async function applyImpairments() {
  if (options.reset) {
    return resetImpairments();
  }

  console.log('🚀 Applying network impairments...');
  
  if (process.platform === 'win32') {
    // Windows implementation using PowerShell
    try {
      let cmd = 'Start-Process powershell -Verb RunAs -ArgumentList "';
      
      if (options.latency > 0) {
        // Note: Windows doesn't have a direct equivalent to tc, so we'll use PowerShell's Test-NetConnection
        // This is a simplified example - consider using a more robust solution for production
        console.warn('⚠️  Latency simulation on Windows requires additional setup (e.g., Clumsy, NetLimiter)');
      }
      
      if (options.bandwidth) {
        // Windows bandwidth limiting requires external tools like NetLimiter or PowerShell's QoS cmdlets
        console.warn('⚠️  Bandwidth limiting on Windows requires additional tools (e.g., NetLimiter)');
      }
      
      console.log('✅ Network impairments applied (Windows support is limited - see warnings above)');
    } catch (error) {
      console.error('❌ Failed to apply network impairments:', error.message);
      process.exit(1);
    }
  } else {
    // Linux implementation using tc
    try {
      // Delete any existing qdisc
      execSync(`sudo tc qdisc del dev ${options.interface} root 2>/dev/null || true`);
      
      let tcCommand = `sudo tc qdisc add dev ${options.interface} root handle 1: htb`;
      
      // Add bandwidth limiting if specified
      if (options.bandwidth) {
        tcCommand += ` && sudo tc class add dev ${options.interface} parent 1: classid 1:1 htb rate ${options.bandwidth}`;
        tcCommand += ` && sudo tc filter add dev ${options.interface} protocol ip parent 1:0 prio 1 handle 1 fw flowid 1:1`;
      }
      
      // Add network delay, jitter, and packet loss
      let netemParams = [];
      
      if (parseInt(options.latency) > 0) {
        netemParams.push(`delay ${options.latency}ms`);
        
        if (parseInt(options.jitter) > 0) {
          netemParams[netemParams.length - 1] += ` ${options.jitter}ms`;
        }
      }
      
      if (parseFloat(options.loss) > 0) {
        netemParams.push(`loss ${options.loss}%`);
      }
      
      if (parseFloat(options.duplicate) > 0) {
        netemParams.push(`duplicate ${options.duplicate}%`);
      }
      
      if (parseFloat(options.corrupt) > 0) {
        netemParams.push(`corrupt ${options.corrupt}%`);
      }
      
      if (netemParams.length > 0) {
        tcCommand += ` && sudo tc qdisc add dev ${options.interface} parent 1:1 handle 10: netem ${netemParams.join(' ')}`;
      }
      
      execSync(tcCommand, { stdio: 'inherit' });
      
      console.log('✅ Network impairments applied:');
      if (options.latency > 0) console.log(`   • Latency: ${options.latency}ms` + (options.jitter > 0 ? ` ± ${options.jitter}ms` : ''));
      if (options.loss > 0) console.log(`   • Packet loss: ${options.loss}%`);
      if (options.duplicate > 0) console.log(`   • Packet duplication: ${options.duplicate}%`);
      if (options.corrupt > 0) console.log(`   • Packet corruption: ${options.corrupt}%`);
      if (options.bandwidth) console.log(`   • Bandwidth limit: ${options.bandwidth}`);
      
    } catch (error) {
      console.error('❌ Failed to apply network impairments:', error.message);
      console.error('Make sure you have tc (traffic control) installed and sufficient permissions.');
      process.exit(1);
    }
  }
  
  // Set up auto-reset if duration is specified
  if (parseInt(options.duration) > 0) {
    console.log(`\n⏳ Will reset network impairments after ${options.duration} seconds...`);
    setTimeout(() => {
      resetImpairments();
      console.log('✅ Network impairments have been reset after timeout');
      process.exit(0);
    }, parseInt(options.duration) * 1000);
  } else {
    console.log('\n🔄 Network impairments will persist until manually reset.');
    console.log('   Run with --reset to clear all impairments.');
  }
}

// Reset all network impairments
function resetImpairments() {
  console.log('🔄 Resetting network impairments...');
  
  if (process.platform === 'win32') {
    // Windows implementation would go here
    console.log('✅ Network impairments reset (Windows support is limited)');
  } else {
    // Linux implementation
    try {
      execSync(`sudo tc qdisc del dev ${options.interface} root 2>/dev/null || true`, { stdio: 'inherit' });
      console.log('✅ Network impairments have been reset');
    } catch (error) {
      console.error('❌ Failed to reset network impairments:', error.message);
      process.exit(1);
    }
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal. Resetting network impairments...');
  resetImpairments();
  process.exit(0);
});

// Main execution
if (!checkPrivileges()) {
  console.error('❌ This tool requires administrator/root privileges to modify network settings.');
  process.exit(1);
}

applyImpairments().catch(error => {
  console.error('❌ An error occurred:', error);
  process.exit(1);
});
