#!/usr/bin/env ruby
# Cecilia OS - Ruby Backend
# Multi-tenant web-based operating system
#
# Run: ruby app.rb
# Or with bundler: bundle exec ruby app.rb

require 'sinatra'
require 'sinatra/json'
require 'bcrypt'
require 'securerandom'
require 'base64'
require 'openssl'
require 'json'
require 'fileutils'

# Configuration
configure do
  set :bind, '0.0.0.0'
  set :port, ENV['PORT'] || 8080

  set :os_name, ENV['OS_NAME'] || 'Cecilia'
  set :os_icon, ENV['OS_ICON'] || '🌼'
  set :api_base, ENV['API_BASE'] || '/api'
  set :data_dir, ENV['DATA_DIR'] || File.join(File.dirname(__FILE__), 'data')
  set :session_secret, ENV['SESSION_SECRET'] || 'change-this-secret-key-in-production'
  set :session_expiry, 7 * 24 * 60 * 60 # 7 days

  # Icons
  set :terminal_icon, '💻'
  set :folder_icon, '📁'
  set :settings_icon, '⚙'
  set :logout_icon, '🚪'

  # Homes directory
  if ENV['HOMES_DIR']
    set :homes_dir, ENV['HOMES_DIR']
  elsif RUBY_PLATFORM.include?('linux') && File.directory?('/home')
    set :homes_dir, '/home'
  else
    set :homes_dir, File.join(settings.data_dir, 'homes')
  end

  # Create directories
  FileUtils.mkdir_p(File.join(settings.data_dir, 'users'))
  FileUtils.mkdir_p(settings.homes_dir)
end

# Security
ALLOWED_COMMANDS = %w[ls cd pwd cat head tail wc mkdir rmdir touch cp mv rm echo date whoami id uname grep find sort uniq diff tar gzip gunzip zip unzip curl wget node npm npx python python3 pip pip3 git claude ruby gem vim nano less more]
BLOCKED_COMMANDS = %w[sudo su passwd useradd userdel usermod chown chmod chgrp mount umount reboot shutdown halt poweroff systemctl service iptables ufw dd mkfs fdisk parted]
USERNAME_REGEX = /^[a-z][a-z0-9_]{2,31}$/

# CORS
before do
  headers['Access-Control-Allow-Origin'] = '*'
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
end

options '*' do
  200
end

# Helper methods
helpers do
  def users_dir
    File.join(settings.data_dir, 'users')
  end

  def user_file(username)
    File.join(users_dir, "#{username}.json")
  end

  def load_user(username)
    file = user_file(username)
    return nil unless File.exist?(file)
    JSON.parse(File.read(file))
  end

  def save_user(user)
    File.write(user_file(user['username']), JSON.pretty_generate(user))
  end

  def generate_token(username)
    payload = {
      username: username,
      exp: Time.now.to_i + settings.session_expiry,
      rand: SecureRandom.hex(16)
    }
    data = Base64.strict_encode64(payload.to_json)
    signature = OpenSSL::HMAC.hexdigest('sha256', settings.session_secret, data)
    "#{data}.#{signature}"
  end

  def verify_token(token)
    return nil unless token
    parts = token.split('.')
    return nil unless parts.length == 2

    data, signature = parts
    expected = OpenSSL::HMAC.hexdigest('sha256', settings.session_secret, data)
    return nil unless Rack::Utils.secure_compare(signature, expected)

    payload = JSON.parse(Base64.strict_decode64(data))
    return nil if payload['exp'] < Time.now.to_i

    payload['username']
  rescue
    nil
  end

  def require_auth
    auth = request.env['HTTP_AUTHORIZATION'] || ''
    return nil unless auth.start_with?('Bearer ')
    verify_token(auth[7..])
  end

  def home_dir(username)
    File.join(settings.homes_dir, username)
  end

  def create_home_dir(username)
    dir = home_dir(username)
    FileUtils.mkdir_p(dir)
    File.directory?(dir)
  end

  def command_allowed?(cmd)
    return false if BLOCKED_COMMANDS.include?(cmd)
    ALLOWED_COMMANDS.include?(cmd)
  end

  def parse_json_body
    JSON.parse(request.body.read)
  rescue
    {}
  end
end

# Auth routes
post '/api/auth/login' do
  data = parse_json_body
  username = data['username'].to_s
  password = data['password'].to_s

  unless username =~ USERNAME_REGEX
    return json error: 'Invalid username format'
  end

  user = load_user(username)
  unless user
    return json error: 'User not found'
  end

  unless BCrypt::Password.new(user['password_hash']) == password
    return json error: 'Invalid password'
  end

  user['last_login'] = Time.now.to_i
  save_user(user)

  token = generate_token(username)
  json success: true, username: username, token: token
end

post '/api/auth/register' do
  data = parse_json_body
  username = data['username'].to_s
  password = data['password'].to_s

  unless username =~ USERNAME_REGEX
    return json error: 'Invalid username. Must be 3-32 chars, start with letter, lowercase alphanumeric only.'
  end

  if password.length < 6
    return json error: 'Password must be at least 6 characters'
  end

  if File.exist?(user_file(username))
    return json error: 'Username already taken'
  end

  unless create_home_dir(username)
    return json error: 'Could not create user directory'
  end

  user = {
    'username' => username,
    'password_hash' => BCrypt::Password.create(password).to_s,
    'created' => Time.now.to_i,
    'last_login' => Time.now.to_i
  }

  save_user(user)

  token = generate_token(username)
  json success: true, username: username, token: token
end

post '/api/auth/verify' do
  data = parse_json_body
  token = data['token'].to_s
  username = data['username'].to_s

  token_user = verify_token(token)
  if token_user && token_user == username
    json valid: true, username: username
  else
    json valid: false
  end
end

# Terminal route
post '/api/terminal/exec' do
  username = require_auth
  unless username
    status 401
    return json error: 'Authorization required'
  end

  data = parse_json_body
  command = data['command'].to_s.strip

  if command.empty?
    return json error: 'No command provided'
  end

  user_home = home_dir(username)
  FileUtils.mkdir_p(user_home)

  parts = command.split(/\s+/)
  base_cmd = parts[0]

  unless command_allowed?(base_cmd)
    if base_cmd == 'help'
      return json output: "Available commands: #{ALLOWED_COMMANDS.sort.join(', ')}"
    end
    return json error: "Command not allowed: #{base_cmd}"
  end

  # Execute command
  begin
    env = {
      'HOME' => user_home,
      'USER' => username,
      'PATH' => '/usr/local/bin:/usr/bin:/bin'
    }

    output = `cd #{Shellwords.escape(user_home)} && #{command} 2>&1`
    response = { output: output.chomp }
    response[:error] = 'Command failed' unless $?.success?
    json response
  rescue => e
    json error: e.message
  end
end

# File list route
get '/api/files/list' do
  username = require_auth
  unless username
    status 401
    return json error: 'Authorization required'
  end

  user_home = home_dir(username)
  path = params[:path] || '~'

  target = if path == '~' || path.empty?
    user_home
  elsif path.start_with?('~')
    File.join(user_home, path[1..])
  else
    path
  end

  resolved = File.expand_path(target)
  unless resolved.start_with?(File.expand_path(user_home))
    status 403
    return json error: 'Access denied'
  end

  unless File.directory?(resolved)
    return json error: 'Not a directory'
  end

  files = Dir.entries(resolved).reject { |f| f == '.' }.map do |name|
    full_path = File.join(resolved, name)
    stat = File.stat(full_path)
    {
      name: name,
      type: File.directory?(full_path) ? 'directory' : 'file',
      size: File.file?(full_path) ? stat.size : 0,
      modified: stat.mtime.to_i
    }
  end.sort_by { |f| [f[:type] == 'directory' ? 0 : 1, f[:name].downcase] }

  display_path = resolved.sub(File.expand_path(user_home), '~')
  json path: display_path, files: files
end

# Serve OS
get '/' do
  paths = ['../core/os.html', './core/os.html', './os.html']
  template = nil

  paths.each do |p|
    full = File.join(File.dirname(__FILE__), p)
    if File.exist?(full)
      template = File.read(full)
      break
    end
  end

  unless template
    status 500
    return 'OS template not found'
  end

  replacements = {
    '{{OS_NAME}}' => settings.os_name,
    '{{OS_ICON}}' => settings.os_icon,
    '{{API_BASE}}' => settings.api_base,
    '{{TERMINAL_ICON}}' => settings.terminal_icon,
    '{{FOLDER_ICON}}' => settings.folder_icon,
    '{{SETTINGS_ICON}}' => settings.settings_icon,
    '{{LOGOUT_ICON}}' => settings.logout_icon
  }

  replacements.each do |key, value|
    template.gsub!(key, value)
  end

  content_type 'text/html; charset=utf-8'
  template
end

puts "\n  #{settings.os_icon} #{settings.os_name} running at http://localhost:#{settings.port}\n\n"
