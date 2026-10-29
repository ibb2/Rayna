Pod::Spec.new do |s|
  s.name = 'RaynaBass'
  s.version = '0.1.0'
  s.summary = 'Rayna desktop BASS audio module'
  s.homepage = 'https://github.com/ibb2/Rayna'
  s.license = { :type => 'zlib' }
  s.author = 'Rayna contributors'
  s.source = { :git => 'https://github.com/ibb2/Rayna.git', :tag => s.version.to_s }
  s.osx.deployment_target = '14.0'
  s.source_files = 'BassEngine.{h,cpp}', 'Utf8Path.h', 'macos/*.{h,mm}', 'session/SessionFile.{h,cpp}', 'sqlite/Database.{h,cpp}', 'sqlite/vendor/sqlite3.{c,h}', 'transfer/Transfer.{h,cpp}', 'proxy/StreamProxy.{h,cpp}', 'proxy/vendor/httplib.h'
  s.resources = 'generated-bass/*.dylib', 'generated-bass/cpp-httplib-LICENSE.txt'
  s.dependency 'React-Core'
  s.pod_target_xcconfig = { 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17' }
end
