Pod::Spec.new do |s|
  s.name           = 'NightOwlLiveActivity'
  s.version        = '0.1.0'
  s.summary        = "Night Owl's ActivityKit bridge"
  s.description    = 'Starts, updates and ends the Night Owl Live Activity from JavaScript.'
  s.author         = 'Night Owl'
  s.homepage       = 'https://github.com/Treys21/NightOwlMobile'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.2' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'ActivityKit'
  s.source_files   = '**/*.swift'
end
